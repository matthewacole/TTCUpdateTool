import { render } from "preact";
import { App } from "./app";

render(<App />, document.getElementById("app")!);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "ALERTS_UPDATED") {
      window.dispatchEvent(new CustomEvent("alerts:updated", { detail: event.data.alerts }));
    }
  });
}
