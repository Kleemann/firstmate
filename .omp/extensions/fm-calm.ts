// Firstmate's home-persistent Calm presentation for OMP (Oh My Pi).
//
// Verified against OMP 18.2.8. OMP is a Pi fork, but its transcript and working
// surfaces differ enough that this extension uses OMP's own exported TUI classes and
// lifecycle. Each internal presentation adapter probes the exact method it patches and
// degrades independently with a diagnostic. docs/calm.md owns the user-facing contract,
// and docs/configuration.md owns the shared config/calm preference.
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import {
  installCalmTranscriptLayout,
  type CalmTranscriptController,
  type OmpCalmTranscriptClasses,
} from "./lib/fm-calm-transcript-layout.ts";
import {
  installCalmWorkingShip,
  type CalmWorkingShipController,
  type OmpCalmWorkingClasses,
} from "./lib/fm-calm-working-ship.ts";

const extensionFile = fileURLToPath(import.meta.url);
const root = resolve(dirname(extensionFile), "../..");

function installCalmAdapter<T>(name: string, install: () => T): T | undefined {
  try {
    return install();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `Firstmate Calm: OMP ${name} presentation adapter unavailable, skipping. ${reason}`,
    );
    return undefined;
  }
}

export default function (pi: ExtensionAPI) {
  const fmHome = process.env.FM_HOME || process.env.FM_ROOT_OVERRIDE || root;
  const configDirectory = process.env.FM_CONFIG_OVERRIDE || resolve(fmHome, "config");
  const preferencePath = resolve(configDirectory, "calm");
  let calm = false;
  let agentRunActive = false;

  const loadPreference = (): boolean => {
    try {
      const stored = readFileSync(preferencePath, "utf8").trim();
      return stored === "on" || stored === "max";
    } catch {
      return false;
    }
  };

  const persistPreference = (active: boolean): void => {
    mkdirSync(dirname(preferencePath), { recursive: true });
    const temporaryPath = `${preferencePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporaryPath, active ? "on\n" : "off\n", {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      renameSync(temporaryPath, preferencePath);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  };

  const settings = pi.pi.settings;
  const transcriptClasses: OmpCalmTranscriptClasses = {
    InteractiveMode: pi.pi.InteractiveMode,
    AssistantMessageComponent: pi.pi.AssistantMessageComponent,
    UserMessageComponent: pi.pi.UserMessageComponent,
  };
  const workingClasses: OmpCalmWorkingClasses = {
    InteractiveMode: pi.pi.InteractiveMode,
  };
  const transcript: CalmTranscriptController | undefined = installCalmAdapter(
    "transcript",
    () =>
      installCalmTranscriptLayout(transcriptClasses, {
        hidesThinking: () => calm,
        hidesWorkingNote: () => calm,
        hidesTools: () => calm || settings.get("display.hideToolActivity") === true,
        hidesOperationalInput: () => calm,
      }),
  );
  const workingShip: CalmWorkingShipController | undefined = installCalmAdapter(
    "working-ship",
    () => installCalmWorkingShip(workingClasses, () => calm),
  );

  pi.on("session_start", (_event, context) => {
    calm = loadPreference();
    agentRunActive = false;
    context.ui.setWorkingMessage();
    void transcript?.refresh(false);
    workingShip?.reset(context);
  });

  pi.on("agent_start", (_event, context) => {
    agentRunActive = true;
    workingShip?.apply(context, agentRunActive);
  });

  pi.on("agent_end", (event, context) => {
    if ((event as { willContinue?: unknown }).willContinue === true) return;
    agentRunActive = false;
    workingShip?.apply(context, agentRunActive);
  });

  pi.on("session_shutdown", (_event, context) => {
    agentRunActive = false;
    workingShip?.reset(context);
    transcript?.clearModes();
  });

  pi.registerCommand("calm", {
    description: "Toggle Firstmate's supported conversation-only transcript presentation.",
    handler: async (_args, context) => {
      const active = !calm;
      try {
        persistPreference(active);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        context.ui.notify(`Firstmate Calm: could not save the preference. ${reason}`, "error");
        return;
      }
      calm = active;
      context.ui.setWorkingMessage();
      await transcript?.refresh(true);
      workingShip?.apply(context, agentRunActive);
    },
  });

}
