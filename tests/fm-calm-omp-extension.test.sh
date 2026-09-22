#!/usr/bin/env bash
# Focused OMP Calm regression for transcript filtering, loader animation, lifecycle, and persistence.
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TMP_ROOT=$(fm_test_tmproot fm-calm-omp-extension)
trap fm_test_cleanup EXIT

if ! command -v node >/dev/null 2>&1; then
  echo "skip: node not found for OMP Calm extension test"
  exit 0
fi

mkdir -p "$TMP_ROOT/home/config"
printf 'on\n' > "$TMP_ROOT/home/config/calm"
operational_input=$(printf 'private watcher payload\n' | "$ROOT/bin/fm-operational-input.sh" encode watcher)

out=$(FM_HOME="$TMP_ROOT/home" \
  FM_OPERATIONAL_INPUT_SCRIPT="$ROOT/bin/fm-operational-input.sh" \
  EXT="$ROOT/.omp/extensions/fm-calm.ts" \
  OPERATIONAL_INPUT="$operational_input" \
  node --input-type=module 2>&1 <<'JS'
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class AssistantMessageComponent {
  message = undefined;

  updateContent(message) {
    this.message = message;
  }
}

class UserMessageComponent {
  constructor(text) {
    this.text = text;
  }

  render() {
    return [this.text];
  }
}

class FakeLoader {
  message = "Working…";

  debugState() {
    return { message: this.message };
  }

  setMessage(message) {
    this.message = message;
  }

  render() {
    return [`stock:${this.message}`];
  }
}

class TranscriptContainer {
  children = [];
  toolActivityVisible = true;

  addChild(component) {
    this.children.push(component);
  }

  setToolActivityVisible(visible) {
    this.toolActivityVisible = visible;
  }

}

class InteractiveMode {
  chatContainer = new TranscriptContainer();
  loadingAnimation = undefined;
  streamingComponent = undefined;
  hideToolActivity = false;
  renders = 0;
  initialRenderOptions = [];
  ui = {
    requestRender: () => {
      this.renders += 1;
    },
  };

  addMessageToChat(message) {
    if (message.role === "assistant") {
      const component = new AssistantMessageComponent();
      component.updateContent(message);
      this.chatContainer.addChild(component);
      return [component];
    }
    if (message.role === "user") {
      const component = new UserMessageComponent(message.content[0].text);
      this.chatContainer.addChild(component);
      return [component];
    }
    return [];
  }

  async renderInitialMessages(options) {
    this.initialRenderOptions.push(options);
  }

  setWorkingMessage(message) {
    this.ensureLoadingAnimation();
    this.loadingAnimation.setMessage(message ?? "Working…");
  }

  ensureLoadingAnimation() {
    this.loadingAnimation ??= new FakeLoader();
  }
}

const handlers = new Map();
const commands = new Map();
const extension = await import(`${pathToFileURL(process.env.EXT).href}?test=${Date.now()}`);
extension.default({
  pi: {
    settings: {
      get(path) {
        if (path === "hideThinkingBlock") return false;
        if (path === "display.hideToolActivity") return false;
        return undefined;
      },
    },
    InteractiveMode,
    AssistantMessageComponent,
    UserMessageComponent,
  },
  on(name, handler) {
    handlers.set(name, handler);
  },
  registerCommand(name, command) {
    commands.set(name, command);
  },
});

for (const event of ["session_start", "agent_start", "agent_end", "session_shutdown"]) {
  assert(handlers.has(event), `missing ${event} handler`);
}
assert(commands.has("calm"), "missing /calm command");

const mode = new InteractiveMode();
let timerCallback;
let timerClears = 0;
const notifications = [];
const context = {
  hasUI: true,
  ui: {
    setWorkingMessage(message) {
      mode.setWorkingMessage(message);
    },
    notify(message, level) {
      notifications.push({ message, level });
    },
  },
  setInterval(callback) {
    timerCallback = callback;
    return { fake: "timer" };
  },
  clearTimer() {
    timerClears += 1;
    timerCallback = undefined;
  },
};

await handlers.get("session_start")({}, context);
assert(mode.chatContainer.toolActivityVisible === false, "Calm did not hide tool activity");

const midTurn = {
  role: "assistant",
  stopReason: "toolUse",
  content: [
    { type: "thinking", thinking: "private reasoning" },
    { type: "text", text: "I will inspect the repository." },
    { type: "toolCall", id: "tool-1" },
  ],
};
await mode.addMessageToChat(midTurn);
const midTurnComponent = mode.chatContainer.children.at(-1);
assert(
  midTurnComponent.message.content.length === 1 &&
    midTurnComponent.message.content[0].type === "toolCall",
  "Calm did not hide thinking and a short working note",
);

const finalAnswer = {
  role: "assistant",
  stopReason: "stop",
  content: [
    { type: "thinking", thinking: "private reasoning" },
    { type: "text", text: "The final answer remains visible." },
  ],
};
await mode.addMessageToChat(finalAnswer);
const finalComponent = mode.chatContainer.children.at(-1);
assert(
  finalComponent.message.content.length === 1 &&
    finalComponent.message.content[0].text === "The final answer remains visible.",
  "Calm hid the final answer or exposed final thinking",
);

await mode.addMessageToChat({
  role: "user",
  content: [{ type: "text", text: process.env.OPERATIONAL_INPUT }],
});
const operationalComponent = mode.chatContainer.children.at(-1);
assert(operationalComponent.render(80).length === 0, "Calm exposed operational input");

await handlers.get("agent_start")({}, context);
assert(typeof timerCallback === "function", "Calm did not start the managed ship timer");
const shipFrame = mode.loadingAnimation.render(40);
assert(shipFrame.length === 3, "Calm did not replace the stock row with the two-row ship");
assert(!shipFrame.some(line => line.startsWith("stock:")), "Calm left the stock working row visible");

timerCallback();
await handlers.get("agent_end")({ willContinue: true }, context);
assert(typeof timerCallback === "function", "willContinue stopped the ship between logical runs");
await handlers.get("agent_end")({}, context);
assert(timerCallback === undefined && timerClears === 1, "final agent_end did not stop the ship timer");
assert(mode.loadingAnimation.render(40)[0] === "stock:Working…", "stock working row was not restored");

await commands.get("calm").handler("", context);
assert(readFileSync(`${process.env.FM_HOME}/config/calm`, "utf8") === "off\n", "/calm did not persist off");
assert(mode.chatContainer.toolActivityVisible === true, "/calm off did not restore tool activity");
assert(midTurnComponent.message.content.length === 3, "/calm off did not restore assistant content");
assert(operationalComponent.render(80).length === 1, "/calm off did not restore operational input");
assert(
  mode.initialRenderOptions.length === 1 &&
    mode.initialRenderOptions[0].clearTerminalHistory === true,
  "/calm did not rebuild native scrollback",
);
assert(notifications.length === 0, "successful Calm operations emitted an error notification");

const incompatibleMode = new InteractiveMode();
incompatibleMode.loadingAnimation = {
  message: "Working…",
  setMessage(message) {
    this.message = message ?? "Working…";
  },
  render() {
    return [`stock:${this.message}`];
  },
};
incompatibleMode.setWorkingMessage();
assert(
  incompatibleMode.loadingAnimation.render(40)[0] === "stock:Working…",
  "an incompatible loader did not keep its stock rendering",
);
await handlers.get("agent_start")({}, context);
assert(timerCallback === undefined, "an incompatible loader still started the Calm timer");

await handlers.get("session_shutdown")({}, context);
console.log("OMP Calm extension behavior passed");
JS
)
status=$?
expect_code 0 "$status" "OMP Calm extension behavior failed: $out"
assert_contains "$out" "OMP Calm extension behavior passed" "OMP Calm behavior proof was missing"
assert_contains "$out" "working loader is incompatible" "missing incompatible-loader diagnostic"
pass "OMP Calm: filtering, tools, working ship, lifecycle, repaint, and persistence"
