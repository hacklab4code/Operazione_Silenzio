import FieldlinkArchive from "./FieldlinkArchive";
import FieldlinkReport from "./FieldlinkReport";
import FieldlinkBoard from "./FieldlinkBoard";
import FieldlinkTimeline from "./FieldlinkTimeline";
import FieldlinkDatabase from "./FieldlinkDatabase";
import FieldlinkSchema from "./FieldlinkSchema";

export default function FieldlinkSectionPage({ section, activity, onOpen, query, documents = [] }) {
  if (section === "archivio" || section === "prove") return <FieldlinkArchive latestQuery={query} onReturn={() => onOpen("radio")} />;
  if (section === "timeline") return (
    <section className="fieldlink-section-page fieldlink-page-timeline" aria-labelledby="fieldlink-page-title" data-testid="fieldlink-page-timeline">
      <FieldlinkTimeline activity={activity} onOpen={onOpen} query={query} />
    </section>
  );
  if (section === "database") return (
    <section className="fieldlink-section-page fieldlink-page-database" aria-labelledby="fieldlink-page-title" data-testid="fieldlink-page-database">
      <FieldlinkDatabase queryContext={query} onReturn={() => onOpen("radio")} />
    </section>
  );
  if (section === "schema") return (
    <section className="fieldlink-section-page fieldlink-page-schema" aria-labelledby="fieldlink-page-title" data-testid="fieldlink-page-schema">
      <FieldlinkSchema documents={documents} onOpen={onOpen} />
    </section>
  );
  if (!["rapporto", "bacheca"].includes(section)) return null;
  return (
    <section className={`fieldlink-section-page fieldlink-page-${section}`} aria-labelledby="fieldlink-page-title" data-testid={`fieldlink-page-${section}`}>
      {section === "rapporto" && <FieldlinkReport />}
      {section === "bacheca" && <FieldlinkBoard />}
    </section>
  );
}
