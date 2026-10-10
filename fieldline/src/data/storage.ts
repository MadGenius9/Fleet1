import type { Snapshot } from "../domain/model";
export interface Storage {
  read(): Promise<Snapshot | null>;
  change(fn: (current: Snapshot | null) => Snapshot): Promise<Snapshot>;
}
export function storage(scope: string): Storage {
  const ready = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(`fieldline-v1-${scope}`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "Local storage could not open. Entered data cannot be safely saved.",
        ),
      );
  });
  return {
    async read() {
      const db = await ready;
      return new Promise((resolve, reject) => {
        const tx = db.transaction("state", "readonly");
        const request = tx.objectStore("state").get("snapshot");
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    },
    async change(fn) {
      const db = await ready;
      return new Promise((resolve, reject) => {
        const tx = db.transaction("state", "readwrite");
        const store = tx.objectStore("state");
        const get = store.get("snapshot");
        let next: Snapshot;
        get.onsuccess = () => {
          try {
            next = fn(get.result || null);
            store.put(next, "snapshot");
          } catch (error) {
            tx.abort();
            reject(error);
          }
        };
        tx.oncomplete = () => resolve(next);
        tx.onerror = () =>
          reject(
            new Error(
              "Local save failed. Keep the app open and retry; this entry is not safely stored.",
            ),
          );
        tx.onabort = () =>
          reject(
            new Error(
              "Local save was aborted. This entry is not safely stored.",
            ),
          );
      });
    },
  };
}
