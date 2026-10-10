import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getFirestore,
  onSnapshot,
  runTransaction,
} from "firebase/firestore";
import { Conflict, type Model, type Entity } from "../domain/model";
import type { Backend } from "./engine";
const env = import.meta.env;
import { configured, fleetId } from "./config";
export function firebaseBackend(): Backend {
  if (!configured)
    throw new Error(
      "Set the VITE_FIELDLINE_* client settings before selecting Firebase.",
    );
  const app = initializeApp(
    {
      apiKey: env.VITE_FIELDLINE_API_KEY,
      projectId: env.VITE_FIELDLINE_PROJECT_ID,
      appId: env.VITE_FIELDLINE_APP_ID,
      authDomain: env.VITE_FIELDLINE_AUTH_DOMAIN,
    },
    "fieldline",
  );
  const db = getFirestore(app, env.VITE_FIELDLINE_DATABASE_ID || "(default)");
  const auth = getAuth(app);
  if (env.DEV && env.VITE_FIELDLINE_USE_EMULATORS === "true") {
    connectAuthEmulator(auth, "http://127.0.0.1:9098", {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, "127.0.0.1", 8088);
  }
  const authenticated = signInAnonymously(auth);
  const base = `fieldline/${fleetId}`;
  return {
    async commit(command) {
      const user = await authenticated;
      await runTransaction(db, async (tx) => {
        const receipt = doc(db, `${base}/operations/${command.id}`);
        if ((await tx.get(receipt)).exists()) return;
        const reads = await Promise.all(
          Object.keys(command.expected).map(async (id) => ({
            id,
            snapshot: await tx.get(doc(db, `${base}/entities/${id}`)),
          })),
        );
        for (const { id, snapshot } of reads)
          if (
            (snapshot.exists() ? snapshot.data().rev : null) !==
            command.expected[id]
          )
            throw new Conflict(id);
        for (const entity of command.writes) {
          const ref = doc(db, `${base}/entities/${entity.id}`);
          if (entity.kind === "deleted") tx.delete(ref);
          else tx.set(ref, JSON.parse(JSON.stringify(entity)));
        }
        tx.set(receipt, {
          id: command.id,
          actor: command.actor,
          at: command.at,
          authUid: user.user.uid,
        });
      });
    },
    subscribe(onModel, onError) {
      let cancelled = false;
      let stop = () => {};
      authenticated
        .then(() => {
          if (cancelled) return;
          stop = onSnapshot(
            collection(db, `${base}/entities`),
            (snapshot) => {
              if (snapshot.metadata.fromCache) return;
              const model: Model = {};
              snapshot.forEach((doc) => {
                model[doc.id] = doc.data() as Entity;
              });
              onModel(model);
            },
            (error) => onError(error),
          );
        })
        .catch((error) => onError(error));
      return () => {
        cancelled = true;
        stop();
      };
    },
  };
}
