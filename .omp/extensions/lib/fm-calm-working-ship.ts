// OMP adapter for Firstmate's Calm working ship.
//
// Verified against OMP 18.2.8 and 18.7.0. OMP exposes setWorkingMessage(), not Pi's
// setWorkingVisible(). The extension gives the stock loader a private sentinel, then
// this API-probed adapter replaces only that loader row with the shared ANSI ship.
// Compaction and retry loaders keep their ordinary messages and rendering.
import {
  CALM_WORKING_SHIP_TICK_MS,
  createCalmWorkingShipAnimation,
  type CalmWorkingShipAnimation,
} from "../../../.pi/extensions/lib/fm-calm-working-ship.ts";

type ManagedTimer = NodeJS.Timeout;

type CalmWorkingContext = {
  hasUI: boolean;
  ui: {
    setWorkingMessage(message?: string): void;
  };
  setInterval(callback: () => void, milliseconds: number): ManagedTimer;
  clearTimer(timer: ManagedTimer): void;
};

type OmpWorkingLoader = {
  debugState(): { message?: unknown };
  render(width: number): readonly string[];
};

type OmpInteractiveMode = {
  loadingAnimation?: OmpWorkingLoader;
  ensureLoadingAnimation(): void;
};

export type OmpCalmWorkingClasses = {
  InteractiveMode: { prototype: OmpInteractiveMode };
};

type CalmWorkingPatch = {
  active(): boolean;
  render(width: number): readonly string[];
  wrappedLoaders: WeakSet<object>;
  disabled: boolean;
};

export type CalmWorkingShipController = {
  reset(context?: CalmWorkingContext): void;
  apply(context: CalmWorkingContext, agentRunActive: boolean): void;
};

const CALM_WORKING_PATCH = Symbol.for("firstmate:calm-working-ship:omp-18.2.8");
const CALM_WORKING_SENTINEL = "\u0000firstmate-calm-working:";

function patchLoader(loader: OmpWorkingLoader, patch: CalmWorkingPatch): void {
  if (patch.wrappedLoaders.has(loader) || patch.disabled) return;
  if (typeof loader.debugState !== "function" || typeof loader.render !== "function") {
    patch.disabled = true;
    console.error(
      "Firstmate Calm: OMP working loader is incompatible, using stock working presentation.",
    );
    return;
  }
  const originalRender = loader.render;
  loader.render = function (width: number): readonly string[] {
    const current = (globalThis as typeof globalThis & {
      [CALM_WORKING_PATCH]?: CalmWorkingPatch;
    })[CALM_WORKING_PATCH];
    const message = this.debugState().message;
    if (
      current?.active() &&
      typeof message === "string" &&
      message.startsWith(CALM_WORKING_SENTINEL)
    ) {
      return ["", ...current.render(width)];
    }
    return originalRender.call(this, width);
  };
  patch.wrappedLoaders.add(loader);
}

function installLoaderAdapter(
  classes: OmpCalmWorkingClasses,
  patch: CalmWorkingPatch,
): void {
  const { InteractiveMode } = classes;
  if (
    typeof InteractiveMode !== "function" ||
    typeof InteractiveMode.prototype.ensureLoadingAnimation !== "function"
  ) {
    throw new Error("Firstmate Calm requires OMP InteractiveMode.ensureLoadingAnimation");
  }

  const originalEnsureLoadingAnimation = InteractiveMode.prototype.ensureLoadingAnimation;
  InteractiveMode.prototype.ensureLoadingAnimation = function (): void {
    originalEnsureLoadingAnimation.call(this);
    const current = (globalThis as typeof globalThis & {
      [CALM_WORKING_PATCH]?: CalmWorkingPatch;
    })[CALM_WORKING_PATCH];
    if (current && this.loadingAnimation) patchLoader(this.loadingAnimation, current);
  };
  (globalThis as typeof globalThis & {
    [CALM_WORKING_PATCH]?: CalmWorkingPatch;
  })[CALM_WORKING_PATCH] = patch;
}

export function installCalmWorkingShip(
  classes: OmpCalmWorkingClasses,
  active: () => boolean,
): CalmWorkingShipController {
  const animation: CalmWorkingShipAnimation = createCalmWorkingShipAnimation();
  const registry = globalThis as typeof globalThis & {
    [CALM_WORKING_PATCH]?: CalmWorkingPatch;
  };
  let patch = registry[CALM_WORKING_PATCH];
  if (patch) {
    patch.active = active;
    patch.render = animation.render;
  } else {
    patch = {
      active,
      render: animation.render,
      wrappedLoaders: new WeakSet(),
      disabled: false,
    };
    installLoaderAdapter(classes, patch);
  }

  let timer: ManagedTimer | undefined;
  let timerContext: CalmWorkingContext | undefined;
  let frameToken = 0;

  const stop = (context?: CalmWorkingContext): void => {
    if (timer !== undefined && timerContext) timerContext.clearTimer(timer);
    timer = undefined;
    timerContext = undefined;
    animation.reset();
    if (context?.hasUI) context.ui.setWorkingMessage();
  };

  return {
    reset(context?: CalmWorkingContext): void {
      stop(context);
    },
    apply(context: CalmWorkingContext, agentRunActive: boolean): void {
      if (!context.hasUI || !active() || !agentRunActive || patch.disabled) {
        stop(context);
        return;
      }
      context.ui.setWorkingMessage(`${CALM_WORKING_SENTINEL}${frameToken}`);
      if (timer !== undefined) return;
      timerContext = context;
      timer = context.setInterval(() => {
        animation.tick();
        frameToken = frameToken === 0 ? 1 : 0;
        context.ui.setWorkingMessage(`${CALM_WORKING_SENTINEL}${frameToken}`);
      }, CALM_WORKING_SHIP_TICK_MS);
    },
  };
}
