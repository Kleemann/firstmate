// OMP transcript adapter for Firstmate's Calm presentation.
//
// Verified against OMP 18.2.8. OMP injects its coding-agent exports through pi.pi,
// so this adapter accepts the exported constructors instead of importing packages that
// the standalone binary does not expose to extension module resolution. Each patched
// method is probed before use; incompatible OMP updates disable only this adapter.
import { calmTextIsSubstantive } from "../../../.claude/mods/firstmate-calm/lib/fm-calm-preservation.ts";
import { classifyFirstmateCurrentOperationalText } from "../../../.pi/extensions/lib/fm-operational-input.ts";

type AssistantContent =
  | { type: "text"; text: string; [key: string]: unknown }
  | { type: "thinking"; thinking: string; [key: string]: unknown }
  | { type: string; [key: string]: unknown };

type AssistantMessage = {
  role: "assistant";
  content: AssistantContent[];
  stopReason?: string;
  [key: string]: unknown;
};

type ChatMessage =
  | AssistantMessage
  | { role: string; content?: unknown; [key: string]: unknown };

type AssistantMessageComponent = {
  updateContent(message: AssistantMessage, options?: unknown): void;
};

type UserMessageComponent = {
  render(width: number): readonly string[];
};

type TranscriptContainer = {
  children: unknown[];
  addChild(component: unknown): void;
  setToolActivityVisible(visible: boolean): void;
};

type RenderInitialOptions = {
  preserveExistingChat?: boolean;
  clearTerminalHistory?: boolean;
};

type OmpUi = {
  requestRender(force?: boolean): void;
};

type InteractiveMode = {
  addMessageToChat(message: ChatMessage, options?: unknown): unknown[];
  renderInitialMessages(options?: RenderInitialOptions): Promise<void>;
  setWorkingMessage(message?: string): void;
  chatContainer: TranscriptContainer;
  streamingComponent?: AssistantMessageComponent;
  hideToolActivity: boolean;
  ui: OmpUi;
};

type Prototype<T> = { prototype: T };

export type OmpCalmTranscriptClasses = {
  InteractiveMode: Prototype<InteractiveMode>;
  AssistantMessageComponent: Prototype<AssistantMessageComponent>;
  UserMessageComponent: Prototype<UserMessageComponent>;
};

export type CalmTranscriptLayoutOptions = {
  hidesThinking(): boolean;
  hidesWorkingNote(): boolean;
  hidesTools(): boolean;
  hidesOperationalInput(): boolean;
};

export type CalmTranscriptController = {
  refresh(redraw: boolean): Promise<void>;
  clearModes(): void;
};

type CalmTranscriptPatch = {
  options: CalmTranscriptLayoutOptions;
  modes: Set<InteractiveMode>;
  originalMessages: WeakMap<object, AssistantMessage>;
  presentationCopies: WeakSet<object>;
  operationalRows: WeakSet<object>;
  patchedContainers: WeakSet<object>;
  invalidModes: WeakSet<object>;
};

const CALM_TRANSCRIPT_PATCH = Symbol.for("firstmate:calm-transcript-layout:omp-18.2.8");

function textOnlyContent(message: ChatMessage): string | undefined {
  if (!Array.isArray(message.content)) return undefined;
  const text: string[] = [];
  for (const block of message.content) {
    if (!block || typeof block !== "object") return undefined;
    const item = block as { type?: unknown; text?: unknown };
    if (item.type !== "text" || typeof item.text !== "string") return undefined;
    text.push(item.text);
  }
  return text.join("\n");
}

function isOperationalInput(message: ChatMessage): boolean {
  if (message.role !== "user") return false;
  const text = textOnlyContent(message);
  return text !== undefined && classifyFirstmateCurrentOperationalText(text) !== undefined;
}

function isMidTurnAssistantMessage(message: AssistantMessage): boolean {
  if (message.stopReason === "toolUse") return true;
  return message.content.some(content => content.type === "toolCall");
}

function presentationMessage(
  message: AssistantMessage,
  options: CalmTranscriptLayoutOptions,
): AssistantMessage {
  const midTurn = isMidTurnAssistantMessage(message);
  const content = message.content.filter(block => {
    if (block.type === "thinking" && options.hidesThinking()) return false;
    if (
      block.type === "text" &&
      midTurn &&
      options.hidesWorkingNote() &&
      !calmTextIsSubstantive(block.text)
    ) {
      return false;
    }
    return true;
  });
  return content.length === message.content.length ? message : { ...message, content };
}

function currentAssistantComponents(
  mode: InteractiveMode,
  patch: CalmTranscriptPatch,
): AssistantMessageComponent[] {
  const components = mode.chatContainer.children.filter(
    component =>
      component !== null &&
      typeof component === "object" &&
      patch.originalMessages.has(component),
  ) as AssistantMessageComponent[];
  if (
    mode.streamingComponent &&
    patch.originalMessages.has(mode.streamingComponent) &&
    !components.includes(mode.streamingComponent)
  ) {
    components.push(mode.streamingComponent);
  }
  return components;
}

function syncMode(mode: InteractiveMode, patch: CalmTranscriptPatch): void {
  mode.chatContainer.setToolActivityVisible(!patch.options.hidesTools());
  for (const component of currentAssistantComponents(mode, patch)) {
    const original = patch.originalMessages.get(component);
    if (original) component.updateContent(original);
  }
  mode.ui.requestRender(true);
}

function captureMode(mode: InteractiveMode, patch: CalmTranscriptPatch): void {
  if (patch.invalidModes.has(mode)) return;
  const container = mode.chatContainer;
  if (
    !container ||
    !Array.isArray(container.children) ||
    typeof container.addChild !== "function" ||
    typeof container.setToolActivityVisible !== "function"
  ) {
    patch.modes.delete(mode);
    patch.invalidModes.add(mode);
    console.error(
      "Firstmate Calm: OMP transcript container is incompatible, skipping that session.",
    );
    return;
  }
  patch.modes.add(mode);
  if (patch.patchedContainers.has(container)) return;
  const originalAddChild = container.addChild;
  container.addChild = function (component: unknown): void {
    const current = (globalThis as typeof globalThis & {
      [CALM_TRANSCRIPT_PATCH]?: CalmTranscriptPatch;
    })[CALM_TRANSCRIPT_PATCH];
    if (current) this.setToolActivityVisible(!current.options.hidesTools());
    return originalAddChild.call(this, component);
  };
  patch.patchedContainers.add(container);
}

function installPrototypeAdapters(
  classes: OmpCalmTranscriptClasses,
  patch: CalmTranscriptPatch,
): void {
  const { InteractiveMode, AssistantMessageComponent, UserMessageComponent } = classes;
  if (
    typeof InteractiveMode !== "function" ||
    typeof InteractiveMode.prototype.addMessageToChat !== "function" ||
    typeof InteractiveMode.prototype.renderInitialMessages !== "function" ||
    typeof InteractiveMode.prototype.setWorkingMessage !== "function"
  ) {
    throw new Error("Firstmate Calm requires OMP InteractiveMode transcript methods");
  }
  if (
    typeof AssistantMessageComponent !== "function" ||
    typeof AssistantMessageComponent.prototype.updateContent !== "function"
  ) {
    throw new Error("Firstmate Calm requires OMP AssistantMessageComponent.updateContent");
  }
  if (
    typeof UserMessageComponent !== "function" ||
    typeof UserMessageComponent.prototype.render !== "function"
  ) {
    throw new Error("Firstmate Calm requires OMP UserMessageComponent.render");
  }

  const originalAssistantUpdate = AssistantMessageComponent.prototype.updateContent;
  AssistantMessageComponent.prototype.updateContent = function (
    message: AssistantMessage,
    options?: unknown,
  ): void {
    const current = (globalThis as typeof globalThis & {
      [CALM_TRANSCRIPT_PATCH]?: CalmTranscriptPatch;
    })[CALM_TRANSCRIPT_PATCH];
    if (!current) return originalAssistantUpdate.call(this, message, options);
    const original = current.presentationCopies.has(message)
      ? current.originalMessages.get(this) ?? message
      : message;
    current.originalMessages.set(this, original);
    const visible = presentationMessage(original, current.options);
    if (visible !== original) current.presentationCopies.add(visible);
    return originalAssistantUpdate.call(this, visible, options);
  };

  const originalUserRender = UserMessageComponent.prototype.render;
  UserMessageComponent.prototype.render = function (width: number): readonly string[] {
    const current = (globalThis as typeof globalThis & {
      [CALM_TRANSCRIPT_PATCH]?: CalmTranscriptPatch;
    })[CALM_TRANSCRIPT_PATCH];
    if (current?.options.hidesOperationalInput() && current.operationalRows.has(this)) {
      return [];
    }
    return originalUserRender.call(this, width);
  };

  const originalAddMessage = InteractiveMode.prototype.addMessageToChat;
  InteractiveMode.prototype.addMessageToChat = function (
    message: ChatMessage,
    options?: unknown,
  ): unknown[] {
    const current = (globalThis as typeof globalThis & {
      [CALM_TRANSCRIPT_PATCH]?: CalmTranscriptPatch;
    })[CALM_TRANSCRIPT_PATCH];
    if (!current) return originalAddMessage.call(this, message, options);
    captureMode(this, current);
    if (current.invalidModes.has(this)) {
      return originalAddMessage.call(this, message, options);
    }
    const before = new Set(this.chatContainer.children);
    const added = originalAddMessage.call(this, message, options);
    if (isOperationalInput(message)) {
      for (const component of this.chatContainer.children) {
        if (
          !before.has(component) &&
          component !== null &&
          typeof component === "object" &&
          UserMessageComponent.prototype.isPrototypeOf(component)
        ) {
          current.operationalRows.add(component);
        }
      }
    }
    return added;
  };

  const originalRenderInitialMessages = InteractiveMode.prototype.renderInitialMessages;
  InteractiveMode.prototype.renderInitialMessages = async function (
    options?: RenderInitialOptions,
  ): Promise<void> {
    const current = (globalThis as typeof globalThis & {
      [CALM_TRANSCRIPT_PATCH]?: CalmTranscriptPatch;
    })[CALM_TRANSCRIPT_PATCH];
    if (!current) return originalRenderInitialMessages.call(this, options);
    captureMode(this, current);
    if (current.invalidModes.has(this)) {
      return originalRenderInitialMessages.call(this, options);
    }
    await originalRenderInitialMessages.call(this, options);
    syncMode(this, current);
  };

  const originalSetWorkingMessage = InteractiveMode.prototype.setWorkingMessage;
  InteractiveMode.prototype.setWorkingMessage = function (message?: string): void {
    const current = (globalThis as typeof globalThis & {
      [CALM_TRANSCRIPT_PATCH]?: CalmTranscriptPatch;
    })[CALM_TRANSCRIPT_PATCH];
    if (current) captureMode(this, current);
    return originalSetWorkingMessage.call(this, message);
  };

  (globalThis as typeof globalThis & {
    [CALM_TRANSCRIPT_PATCH]?: CalmTranscriptPatch;
  })[CALM_TRANSCRIPT_PATCH] = patch;
}

export function installCalmTranscriptLayout(
  classes: OmpCalmTranscriptClasses,
  options: CalmTranscriptLayoutOptions,
): CalmTranscriptController {
  const registry = globalThis as typeof globalThis & {
    [CALM_TRANSCRIPT_PATCH]?: CalmTranscriptPatch;
  };
  let patch = registry[CALM_TRANSCRIPT_PATCH];
  if (patch) {
    patch.options = options;
  } else {
    patch = {
      options,
      modes: new Set(),
      originalMessages: new WeakMap(),
      presentationCopies: new WeakSet(),
      operationalRows: new WeakSet(),
      patchedContainers: new WeakSet(),
      invalidModes: new WeakSet(),
    };
    installPrototypeAdapters(classes, patch);
  }

  return {
    async refresh(redraw: boolean): Promise<void> {
      for (const mode of [...patch.modes]) {
        if (!redraw) {
          syncMode(mode, patch);
          continue;
        }
        const hostHidesTools = mode.hideToolActivity;
        mode.hideToolActivity = patch.options.hidesTools();
        try {
          await mode.renderInitialMessages({ clearTerminalHistory: true });
        } finally {
          mode.hideToolActivity = hostHidesTools;
        }
        syncMode(mode, patch);
      }
    },
    clearModes(): void {
      patch.modes.clear();
    },
  };
}
