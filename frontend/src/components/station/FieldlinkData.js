import { useCallback, useEffect, useState } from "react";

import { invalidateCatalog } from "./FieldlinkSourcePreview";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api/fieldlink/data`;
const EMPTY_DATA = { documents: [], radio_logs: [], archive: null, board: null, mission: null, generated_at: null };

export function notifyFieldlinkDataUpdated() {
  invalidateCatalog();
  window.dispatchEvent(new Event("fieldlink:data-updated"));
}

export function useFieldlinkData() {
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (signal) => {
    setRefreshing(true);
    try {
      const response = await fetch(API, { signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Backend non disponibile (${response.status})`);
      const payload = await response.json();
      if (signal?.aborted) return;
      setData({
        documents: Array.isArray(payload.documents) ? payload.documents : [],
        radio_logs: Array.isArray(payload.radio_logs) ? payload.radio_logs : [],
        archive: payload.archive || null,
        board: payload.board || null,
        mission: payload.mission || null,
        generated_at: payload.generated_at || null,
      });
      setError("");
    } catch (fetchError) {
      if (fetchError.name !== "AbortError") {
        setError("Dati non raggiungibili dal backend. Riprova tra poco.");
      }
    } finally {
      if (!signal?.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    let controller = new AbortController();
    const load = () => {
      controller.abort();
      controller = new AbortController();
      fetchData(controller.signal);
    };
    load();
    const timer = window.setInterval(load, 15000);
    window.addEventListener("fieldlink:data-updated", load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("fieldlink:data-updated", load);
      controller.abort();
    };
  }, [fetchData]);

  return { ...data, loading, error, refreshing, refresh: notifyFieldlinkDataUpdated };
}

export function DataMessage({ loading, error, empty, isEmpty = false, children }) {
  if (loading) return <p className="fieldlink-data-message">Caricamento dati dal backend…</p>;
  if (error) return <p className="fieldlink-data-message is-error" role="status">{error}</p>;
  if (isEmpty && empty) return <p className="fieldlink-data-message">{empty}</p>;
  return children || null;
}

export function formatFieldlinkDate(value, options = {}) {
  if (!value) return "Data non disponibile";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data non disponibile";
  return date.toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  });
}
