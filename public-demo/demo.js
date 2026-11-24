const byId = (id) => document.getElementById(id);
const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const severities = { baseline: "Baseline", medium: "Medium", high: "High", critical: "Critical" };
const evidenceLabels = {
  "userIdentity.userName": "Actor",
  "userIdentity.type": "Identity type",
  eventSource: "Event source",
  sourceIPAddress: "Source IP",
  "geo.country": "Country code",
  "responseElements.ConsoleLogin": "Sign-in result",
  "requestParameters.userName": "Target identity",
  "requestParameters.policyArn": "Policy ARN",
  "requestParameters.bucketName": "Bucket",
  "requestParameters.grantee_uri": "Grantee",
  "requestParameters.name": "Audit trail",
};

function make(tag, text, className) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function offsetLabel(seconds) {
  return `T+${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function renderTrace(node) {
  const item = make("div", null, node.field ? "predicate" : "trace-group");
  const label = make("div", null, "predicate-heading");
  const truth = make("span", node.matched ? "True" : "False", "truth");
  truth.dataset.matched = String(node.matched);
  if (node.field) {
    label.append(make("code", node.field), truth);
    const comparison = make("dl", null, "comparison");
    const observed = make("div");
    observed.append(make("dt", "Observed"), make("dd", node.actual ?? "Missing", "mono"));
    const expected = make("div");
    const alternatives = make("ul", null, "alternatives");
    for (const value of node.values) {
      const choice = make("li");
      const result = make("span", value.matched ? "Matches" : "Differs", "choice-result");
      result.dataset.matched = String(value.matched);
      choice.append(make("code", value.expected), result);
      alternatives.append(choice);
    }
    const expectedValues = make("dd");
    expectedValues.append(alternatives);
    const operator =
      node.values.length > 1 ? `${node.operator} · ${node.linking.toUpperCase()}` : node.operator;
    expected.append(make("dt", `Expected · ${operator}`), expectedValues);
    comparison.append(observed, expected);
    item.append(label, comparison);
  } else {
    label.append(
      make("code", node.name || "Group"),
      make("span", node.linking.toUpperCase(), "join"),
      truth,
    );
    item.append(label, ...node.children.map(renderTrace));
  }
  return item;
}

async function initialize() {
  const { default: data } = await import("./data.js");
  const { events, rules } = data;
  const workspace = byId("workspace");
  const seek = byId("seek");
  const speed = byId("speed");
  const tabs = [...workspace.querySelectorAll('[role="tab"]')];
  const reviewed = new Set();
  const last = events.length - 1;
  let cursor = last;
  let current = events.findIndex((event) => event.matched);
  let detectionsOnly = false;
  let timer;

  const severityOf = (event) => (event.matched ? rules[event.rule].severity : "baseline");
  const chartEvents = events.map((event, index) => {
    const severity = severityOf(event);
    const bar = make("button", null, "chart-event");
    bar.type = "button";
    bar.dataset.severity = severity;
    bar.setAttribute(
      "aria-label",
      `${event.title}, ${severities[severity]}, ${offsetLabel(event.offset)}`,
    );
    const fill = make("span", null, "bar");
    const caption = make("span", offsetLabel(event.offset), "bar-time");
    fill.setAttribute("aria-hidden", "true");
    caption.setAttribute("aria-hidden", "true");
    bar.append(fill, caption);
    bar.addEventListener("click", () => inspect(index));
    byId("chart").append(bar);
    return bar;
  });

  const queueEvents = events.map((event, index) => {
    const severity = severityOf(event);
    const item = make("li");
    const row = make("button", null, "event-row");
    row.type = "button";
    row.dataset.severity = severity;
    const dot = make("span", null, "event-dot");
    dot.setAttribute("aria-hidden", "true");
    const summary = make("span", null, "event-summary");
    const actor = event.fields["userIdentity.userName"] ?? event.fields["userIdentity.type"];
    summary.append(make("strong", event.title), make("small", actor, "mono"));
    const meta = make("span", null, "row-meta");
    const status = make("small", severities[severity], "row-status");
    meta.append(make("small", offsetLabel(event.offset), "mono"), status);
    row.append(dot, summary, meta);
    row.addEventListener("click", (click) => {
      inspect(index);
      if (click.detail && matchMedia("(max-width: 800px)").matches) {
        byId("event-title").scrollIntoView({ block: "start" });
      }
    });
    item.append(row);
    byId("events").append(item);
    return { item, row, status };
  });

  function updatePositions() {
    const visible = events.slice(0, cursor + 1);
    const detectionCount = visible.filter((event) => event.matched).length;
    const reviewCount = [...reviewed].filter((index) => index <= cursor).length;
    byId("event-count").textContent = visible.length;
    byId("detection-count").textContent = detectionCount;
    byId("review-count").textContent = reviewCount;
    byId("position").textContent = `${cursor + 1} / ${events.length}`;
    seek.value = cursor + 1;
    seek.setAttribute(
      "aria-valuetext",
      `Event ${cursor + 1} of ${events.length}, ${events[cursor].title}`,
    );
    byId("queue-count").textContent = `${detectionsOnly ? detectionCount : visible.length} shown`;
    byId("queue-empty").hidden = !detectionsOnly || detectionCount > 0;
    byId("brief-status").textContent =
      `${reviewCount} of ${visible.length} available events reviewed. Review marks reset when you leave the page.`;
    chartEvents.forEach((button, index) => {
      button.dataset.pending = String(index > cursor);
      button.setAttribute("aria-pressed", String(index === current));
    });
    queueEvents.forEach(({ item, row, status }, index) => {
      item.hidden = index > cursor || (detectionsOnly && !events[index].matched);
      row.setAttribute("aria-pressed", String(index === current));
      status.textContent = reviewed.has(index) ? "Reviewed" : severities[severityOf(events[index])];
    });
    byId("review").setAttribute("aria-pressed", String(reviewed.has(current)));
    byId("replay-state").textContent =
      timer !== undefined
        ? "Replaying events"
        : cursor === last
          ? "Full incident loaded"
          : "Replay paused";
  }

  function select(index) {
    current = index;
    const event = events[index];
    const rule = rules[event.rule];
    const severity = severityOf(event);
    const eventSeverity = byId("event-severity");
    eventSeverity.dataset.severity = severity;
    eventSeverity.textContent = severities[severity];
    byId("timestamp").textContent =
      `${offsetLabel(event.offset)} · ${clock.format(new Date(event.timestamp))} UTC`;
    byId("event-title").textContent = event.title;
    byId("event-note").textContent = event.note;
    byId("evidence-json").textContent = JSON.stringify(event.fields, null, 2);
    byId("evidence-fields").replaceChildren(
      ...Object.entries(evidenceLabels).flatMap(([key, title]) => {
        if (!Object.hasOwn(event.fields, key)) return [];
        const field = make("div");
        field.append(make("dt", title), make("dd", event.fields[key], "mono"));
        return [field];
      }),
    );
    const verdict = byId("verdict");
    verdict.textContent = event.matched ? "Rule matched" : "No match";
    verdict.dataset.severity = severity;
    byId("rule-title").textContent = rule.title;
    byId("condition").textContent = event.condition;
    byId("rule-yaml").textContent = rule.content;
    byId("trace-groups").replaceChildren(...event.groups.map(renderTrace));
    byId("techniques").replaceChildren(
      ...rule.techniques.map(({ id, name }) => {
        const technique = make("span", null, "technique");
        technique.append(make("code", id), make("span", name));
        return technique;
      }),
    );
    updatePositions();
  }

  function pause() {
    clearInterval(timer);
    timer = undefined;
    byId("play-icon").textContent = "▶";
    byId("play-label").textContent = cursor === last ? "Play replay" : "Resume replay";
    updatePositions();
  }

  function start() {
    byId("play-icon").textContent = "Ⅱ";
    byId("play-label").textContent = "Pause replay";
    timer = setInterval(
      () => {
        cursor += 1;
        select(cursor);
        if (cursor === last) pause();
      },
      1300 / Number(speed.value),
    );
    updatePositions();
  }

  function inspect(index) {
    cursor = Math.max(cursor, index);
    select(index);
    pause();
  }

  function filter(detections) {
    detectionsOnly = detections;
    byId("filter-all").setAttribute("aria-pressed", String(!detections));
    byId("filter-detections").setAttribute("aria-pressed", String(detections));
    updatePositions();
  }

  function showTab(index, focus = false) {
    tabs.forEach((tab, position) => {
      const selected = index === position;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      byId(tab.getAttribute("aria-controls")).hidden = !selected;
    });
    if (focus) tabs[index].focus();
  }

  seek.max = events.length;
  seek.addEventListener("input", () => {
    cursor = seek.valueAsNumber - 1;
    select(cursor);
    pause();
  });
  speed.addEventListener("change", () => {
    if (timer !== undefined) {
      clearInterval(timer);
      start();
    }
  });
  byId("play").addEventListener("click", () => {
    if (timer !== undefined) {
      pause();
      return;
    }
    if (cursor === last) {
      cursor = 0;
      select(0);
    }
    start();
  });
  byId("filter-all").addEventListener("click", () => filter(false));
  byId("filter-detections").addEventListener("click", () => filter(true));
  byId("review").addEventListener("click", () => {
    const mark = !reviewed.has(current);
    if (mark) reviewed.add(current);
    else reviewed.delete(current);
    byId("announcement").textContent =
      `${events[current].title}: ${mark ? "reviewed" : "review mark cleared"}.`;
    updatePositions();
  });

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => showTab(index));
    tab.addEventListener("keydown", (event) => {
      const next = {
        ArrowLeft: (index + tabs.length - 1) % tabs.length,
        ArrowRight: (index + 1) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      showTab(next, true);
    });
  });
  byId("open-trace").addEventListener("click", () => showTab(1, true));

  const answers = [...workspace.querySelectorAll("[data-answer]")];
  const jump = byId("jump-to-audit");
  for (const answer of answers) {
    answer.addEventListener("click", () => {
      answers.forEach((button) => button.setAttribute("aria-pressed", String(button === answer)));
      const correct = answer.dataset.answer === "StopLogging";
      const feedback = byId("feedback");
      feedback.textContent = correct
        ? "Correct. The event name and CloudTrail source identify the change to logging for this trail."
        : "Look for an event from the CloudTrail service that directly changes the trail's state.";
      feedback.dataset.correct = String(correct);
      jump.hidden = !correct;
    });
  }
  jump.addEventListener("click", () => {
    inspect(events.findIndex((event) => event.fields.eventName === "StopLogging"));
    showTab(0, true);
  });

  select(current);
  byId("metrics").hidden = false;
  workspace.hidden = false;
}

initialize().catch(() => {
  byId("load-error").hidden = false;
});
