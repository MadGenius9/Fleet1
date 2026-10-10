import type { Backend } from "./engine";
const env = import.meta.env;
export const configured = Boolean(
  env.VITE_FIELDLINE_API_KEY &&
  env.VITE_FIELDLINE_PROJECT_ID &&
  env.VITE_FIELDLINE_APP_ID,
);
export const fleetId = env.VITE_FIELDLINE_FLEET_ID || "fleet1";
export const firebaseScope = `firebase-${env.VITE_FIELDLINE_PROJECT_ID || "unconfigured"}-${env.VITE_FIELDLINE_DATABASE_ID || "(default)"}-${fleetId}`;
export function firebaseBackend(): Backend {
  if (!configured)
    throw new Error(
      "Set the VITE_FIELDLINE_* client settings before selecting Firebase.",
    );
  const ready = import("./firebase").then((module) => module.firebaseBackend());
  return {
    async commit(command) {
      return (await ready).commit(command);
    },
    subscribe(next, error) {
      let cancelled = false;
      let stop = () => {};
      ready
        .then((backend) => {
          if (!cancelled) stop = backend.subscribe(next, error);
        })
        .catch(error);
      return () => {
        cancelled = true;
        stop();
      };
    },
  };
}
