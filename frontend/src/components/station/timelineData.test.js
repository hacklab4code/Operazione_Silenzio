import { openedMissionDays } from "./missionCalendar";
import { buildTimelineEvents, TIMELINE_DAYS, TIMELINE_PATHS } from "./timelineData";

describe("buildTimelineEvents", () => {
  test("opens the mission through day 4 and uses document collection days instead of file dates", () => {
    expect(openedMissionDays(new Date("2026-10-22T12:00:00+02:00"))).toEqual([1, 2, 3, 4]);
    expect(TIMELINE_DAYS).toEqual(openedMissionDays());
    const events = buildTimelineEvents({ documents: [
      { id: "G1-01", title: "Centrale", updated_at: "2026-10-21T08:00:00Z" },
      { id: "LX2-9919", title: "Giorno operativo 03" },
      { id: "ARCH-001", day: 3, title: "Dossier" },
      { id: "G1-02", day: 2, title: "Giorno esplicito" },
      { id: "unknown", title: "Senza giorno", updated_at: "2026-10-21T08:00:00Z" },
    ] });
    const days = Object.fromEntries(events.map(event => [event.title, event.day]));
    expect(days).toEqual({ Centrale: 1, "Giorno operativo 03": 2, Dossier: 3, "Giorno esplicito": 2, "Senza giorno": null });
  });

  test("groups recorded events by the mission calendar in Rome, including local midnight", () => {
    const events = buildTimelineEvents({
      radioLogs: [
        { id: "day-1", question: "Primo", created_at: "2026-10-19T12:00:00Z" },
        { id: "midnight", question: "Secondo", created_at: "2026-10-19T22:30:00Z" },
        { id: "day-3", question: "Terzo", created_at: "2026-10-21T12:00:00Z" },
        { id: "day-4", question: "Quarto", created_at: "2026-10-22T12:00:00Z" },
        { id: "outside", question: "Fuori calendario", created_at: "2026-10-24T12:00:00Z" },
      ],
      activity: [{ id: "discovery", kind: "discovery", title: "Scoperta", createdAt: "2026-10-20T22:30:00Z" }],
    });
    expect(Object.fromEntries(events.map(event => [event.title, event.day]))).toEqual({
      Primo: 1, Secondo: 2, Terzo: 3, Quarto: 4, "Fuori calendario": null,
    });
  });

  test("places undated records first and merges actual events chronologically without mutating the sources", () => {
    const radioLogs = [
      { id: "later", question: "Ultima domanda", created_at: "2026-10-20T12:30:00+02:00" },
      { id: "invalid", question: "Senza orario", created_at: "non una data" },
      { id: "earlier", question: "Prima domanda", created_at: "2026-10-20T09:00:00Z" },
    ];
    const before = JSON.stringify(radioLogs);
    const events = buildTimelineEvents({
      radioLogs,
      activity: [{ id: "discovery-pozzo", kind: "discovery", title: "Pozzo Venezia", createdAt: "2026-10-20T10:00:00Z" }],
    });

    expect(events.map((event) => event.title)).toEqual(["Senza orario", "Prima domanda", "Ultima domanda"]);
    expect(events[0].createdAt).toBeNull();
    expect(events[2].createdAt).toBe("2026-10-20T10:30:00.000Z");
    expect(JSON.stringify(radioLogs)).toBe(before);
  });

  test("offers only radio and investigation and excludes saved excavation and reveal events", () => {
    expect(TIMELINE_PATHS.map((path) => path.id)).toEqual(["radio", "indagine"]);
    const events = buildTimelineEvents({
      documents: [{ id: "G1-01", title: "Centrale" }],
      radioLogs: [
        { id: "marco", question: "A.N.I.M.A.", resolved_respondent_mode: "marco", resolved_processing_mode: "documentary" },
        { id: "team", question: "Team", resolved_respondent_mode: "team" },
      ],
      activity: [
        { id: "discovery-pozzo", kind: "discovery", title: "Pozzo" },
        { id: "reveal-sigillo", kind: "reveal", title: "Sigillo" },
      ],
    });

    expect(events.map(({ route, kind }) => [route, kind])).toEqual([
      ["indagine", "document"], ["radio", "radio"], ["indagine", "radio"],
    ]);
    expect(events[1].summary).toBe("A.N.I.M.A. · ricerca documentale");
    expect(events[2].summary).toBe("Team investigativo · elaborazione libera");
  });

  test("preserves the original document and explicitly labels its file timestamp", () => {
    const content = "ID G1-03\nControllo radio\n\nPotrebbe essere una registrazione.\n";
    const [event] = buildTimelineEvents({ documents: [{
      id: "G1-03", title: "Controllo radio", content, updated_at: "2026-10-20T08:00:00Z",
    }] });

    expect(event).toMatchObject({
      title: "Controllo radio", content,
      summary: "Documento disponibile nell’archivio del caso.",
      meta: "Data di aggiornamento del file",
      createdAt: "2026-10-20T08:00:00.000Z",
      sessionId: null, sourceIds: [],
    });
  });

  test("retains the actual session and backend source metadata without inventing citations", () => {
    const [event] = buildTimelineEvents({ radioLogs: [{
      id: "log-1", session_id: "sess-current", answer: "Una risposta [inventato]",
      source_ids: ["G1-01", "G1-01", "G1-03", null, 3, ""],
    }] });

    expect(event).toMatchObject({
      title: "Comunicazione radio", content: "Una risposta [inventato]",
      meta: "Trascrizione registrata", sessionId: "sess-current", sourceIds: ["G1-01", "G1-03"],
    });
  });

  test("handles missing arrays, malformed records, unsupported activity, and invalid field types", () => {
    expect(buildTimelineEvents()).toEqual([]);
    expect(buildTimelineEvents(null)).toEqual([]);
    expect(buildTimelineEvents({ documents: {}, radioLogs: "logs", activity: null })).toEqual([]);
    const events = buildTimelineEvents({
      documents: [null, [], "text", {}],
      radioLogs: [false, {}, { id: "bad-fields", answer: {}, source_ids: "G1-01", created_at: {} }],
      activity: [{ id: "future", kind: "locked", content: "Spoiler" }, null],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ content: "", createdAt: null, sessionId: null, sourceIds: [] });
  });

  test("deduplicates same-kind IDs and anonymous content while keeping distinct event kinds", () => {
    const anonymousLog = { question: "Ci sei?", answer: "Ricevuto.", created_at: "2026-10-20T09:00:00Z" };
    const input = {
      documents: [{ id: "shared", title: "Documento" }, { id: "shared", title: "Duplicato" }],
      radioLogs: [{ id: "shared", question: "Radio" }, anonymousLog, { ...anonymousLog }],
      activity: [
        { id: "reveal-sigillo", kind: "reveal", title: "Sigillo" },
        { id: "reveal-sigillo", kind: "reveal", title: "Sigillo" },
      ],
    };
    const events = buildTimelineEvents(input);

    expect(events).toHaveLength(3);
    expect(new Set(events.map((event) => event.id)).size).toBe(3);
    expect(events.find((event) => event.kind === "document").title).toBe("Documento");
    expect(events.find((event) => event.title === "Ci sei?").id).toBe(
      buildTimelineEvents({ radioLogs: [anonymousLog] })[0].id,
    );
  });

  test("keeps anonymous IDs stable when a refresh reorders records and retains ties in source order", () => {
    const first = { question: "Uno", created_at: "2026-10-20T09:00:00Z" };
    const second = { question: "Due", created_at: "2026-10-20T09:00:00Z" };
    const before = buildTimelineEvents({ radioLogs: [first, second] });
    const after = buildTimelineEvents({ radioLogs: [second, first] });

    expect(before.map((event) => event.title)).toEqual(["Uno", "Due"]);
    expect(after[1].id).toBe(before[0].id);
    expect(after[0].id).toBe(before[1].id);
  });
});
