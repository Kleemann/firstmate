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

// OMP 18.7.0 renders an assistant message through segment copies that drop tool calls,
// force stopReason "stop", and share the original content block objects.
function beforeToolsSegment(message) {
  const index = message.content.findIndex(block => block.type === "toolCall");
  if (index === -1) return message;
  return { ...message, content: message.content.slice(0, index), stopReason: "stop" };
}

class InteractiveMode {
  chatContainer = new TranscriptContainer();
  loadingAnimation = undefined;
  streamingComponent = undefined;
  streamingMessage = undefined;
  segmentsAssistantMessages = false;
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
      component.updateContent(
        this.segmentsAssistantMessages ? beforeToolsSegment(message) : message,
      );
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
// OMP 18.7.0's injected settings object has no generic get(); Calm must not need one.
extension.default({
  pi: {
    settings: {},
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

await mode.addMessageToChat({
  role: "user",
  content: [{ type: "text", text: "Ordinary captain input stays visible." }],
});
const ordinaryComponent = mode.chatContainer.children.at(-1);
assert(
  ordinaryComponent.render(80)[0] === "Ordinary captain input stays visible.",
  "Calm hid ordinary user input",
);

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

mode.hideToolActivity = true;
await mode.addMessageToChat(finalAnswer);
assert(
  mode.chatContainer.toolActivityVisible === false,
  "Calm off overrode OMP's own hidden tool-activity choice",
);
mode.hideToolActivity = false;
await commands.get("calm").handler("", context);
assert(readFileSync(`${process.env.FM_HOME}/config/calm`, "utf8") === "on\n", "/calm did not persist on");
assert(mode.chatContainer.toolActivityVisible === false, "/calm on did not hide tool activity again");
assert(mode.hideToolActivity === false, "/calm changed OMP's own tool-activity choice");
await commands.get("calm").handler("", context);
assert(mode.chatContainer.toolActivityVisible === true, "second /calm off did not restore tool activity");

await commands.get("calm").handler("", context);
const segmentedMode = new InteractiveMode();
segmentedMode.segmentsAssistantMessages = true;
await segmentedMode.addMessageToChat(midTurn);
const segmentedMidTurn = segmentedMode.chatContainer.children.at(-1);
assert(
  segmentedMidTurn.message.content.length === 0,
  "Calm kept a short working note from an OMP 18.7.0 tool-call segment",
);
await segmentedMode.addMessageToChat(finalAnswer);
assert(
  segmentedMode.chatContainer.children.at(-1).message.content[0].text ===
    "The final answer remains visible.",
  "Calm hid the final answer from an OMP 18.7.0 segment",
);

const streamed = new AssistantMessageComponent();
segmentedMode.chatContainer.addChild(streamed);
segmentedMode.streamingComponent = streamed;
segmentedMode.streamingMessage = {
  role: "assistant",
  content: [{ type: "text", text: "On it" }],
};
streamed.updateContent(beforeToolsSegment(segmentedMode.streamingMessage), { transient: true });
assert(streamed.message.content[0]?.text === "On it", "Calm hid a note before its step called a tool");
segmentedMode.streamingMessage = {
  ...segmentedMode.streamingMessage,
  stopReason: "toolUse",
  content: [...segmentedMode.streamingMessage.content, { type: "toolCall", id: "tool-2" }],
};
streamed.updateContent(beforeToolsSegment(segmentedMode.streamingMessage));
assert(
  streamed.message.content.length === 0,
  "Calm kept a settled short note from a live OMP 18.7.0 tool-call segment",
);
segmentedMode.streamingComponent = new AssistantMessageComponent();
segmentedMode.streamingMessage = finalAnswer;

await commands.get("calm").handler("", context);
assert(streamed.message.content[0]?.text === "On it", "/calm off did not restore a live segment note");
assert(
  segmentedMidTurn.message.content.length === 2,
  "/calm off did not restore a rebuilt segment's thinking and note",
);
await commands.get("calm").handler("", context);
assert(streamed.message.content.length === 0, "/calm on did not re-hide a settled live segment note");
assert(segmentedMidTurn.message.content.length === 0, "/calm on did not re-hide a rebuilt segment note");

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
pass "OMP Calm: filtering, OMP 18.7.0 segments, tools, host tool choice, working ship, lifecycle, repaint, and persistence"
