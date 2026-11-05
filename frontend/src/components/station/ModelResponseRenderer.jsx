import ModelResponseContent from "./ModelResponseContent";
import SqlQueryResponse from "./SqlQueryResponse";
import TypedText from "./TypedText";

export { parseModelResponse } from "./ModelResponseContent";
export { parseSqlToolResponse } from "./sqlResponse";

export default function ModelResponseRenderer(props) {
  if (props.quality < 85 && props.text) {
    return (
      <div className="model-response-unstructured model-response-section section-answer">
        <div className="model-response-plain-text">
          <p><TypedText text={props.text} quality={props.quality} typewriter={false} /></p>
        </div>
        {props.pending && <span className="model-response-cursor">▌</span>}
      </div>
    );
  }
  if (typeof props.text === "string" && /^🔎\s*TOOL SQL\s*·\s*GIORNO \d+/im.test(props.text.trim())) {
    return <SqlQueryResponse {...props} variant={props.sqlVariant || "chat"} />;
  }
  return <ModelResponseContent {...props} />;
}
