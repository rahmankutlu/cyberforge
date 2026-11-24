const replay = document.getElementById("replay");

async function initialize() {
  const { default: data } = await import("./data.js");
  const timeline = document.getElementById("timeline");
  const seek = document.getElementById("seek");
  const play = document.getElementById("play");
  const progress = document.getElementById("progress");
  const evidence = document.getElementById("evidence");
  const timestamp = document.getElementById("timestamp");
  const verdict = document.getElementById("verdict");
  const condition = document.getElementById("condition");
  const checks = document.getElementById("checks");
  let current = 0;
  let timer;

  seek.max = String(data.events.length);
  document.getElementById("rule-title").textContent = data.rule.title;
  document.getElementById("rule-content").textContent = data.rule.content;

  const buttons = data.events.map((event, index) => {
    const button = document.createElement("button");
    const title = document.createElement("strong");
    const time = document.createElement("small");
    const minutes = Math.floor(event.offset / 60);
    const seconds = event.offset % 60;
    button.type = "button";
    title.textContent = `${event.fields["userIdentity.type"]} sign-in`;
    time.textContent = `T+${minutes}m ${String(seconds).padStart(2, "0")}s`;
    button.append(time, title);
    button.addEventListener("click", () => {
      pause();
      select(index);
    });
    timeline.append(button);
    return button;
  });

  function select(index) {
    current = index;
    const event = data.events[index];
    progress.textContent = `Event ${index + 1} of ${data.events.length}`;
    seek.value = String(index + 1);
    seek.setAttribute("aria-valuetext", buttons[index].querySelector("strong").textContent);
    buttons.forEach((button, position) => {
      button.setAttribute("aria-pressed", String(position === index));
    });
    timestamp.textContent = event.timestamp;
    evidence.textContent = JSON.stringify(event.fields, null, 2);
    verdict.textContent = event.matched ? "Matched" : "No match";
    verdict.dataset.matched = String(event.matched);
    condition.textContent = event.condition;
    checks.replaceChildren(
      ...event.checks.map((check) => {
        const row = document.createElement("tr");
        for (const value of [
          check.field,
          check.expected,
          check.actual,
          check.matched ? "Pass" : "Fail",
        ]) {
          row.insertCell().textContent = value ?? "—";
        }
        return row;
      }),
    );
  }

  function pause() {
    clearInterval(timer);
    timer = undefined;
    play.textContent = "Play replay";
  }

  seek.addEventListener("input", () => {
    pause();
    select(seek.valueAsNumber - 1);
  });
  play.addEventListener("click", () => {
    if (timer !== undefined) {
      pause();
      return;
    }
    if (current === data.events.length - 1) select(0);
    play.textContent = "Pause replay";
    timer = setInterval(() => {
      select(current + 1);
      if (current === data.events.length - 1) pause();
    }, 1600);
  });

  select(0);
  replay.hidden = false;
}

initialize().catch(() => {
  document.getElementById("load-error").hidden = false;
});
