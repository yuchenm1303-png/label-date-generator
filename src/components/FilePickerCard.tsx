import { CheckCircle2, FolderOpen } from "lucide-react";

type Props = {
  title: string;
  description: string;
  path: string;
  actionLabel: string;
  meta?: string;
  ready?: boolean;
  onChoose: () => void;
};

export function FilePickerCard({ title, description, path, actionLabel, meta, ready, onChoose }: Props) {
  return (
    <div className="picker-row">
      <div className={`picker-icon ${ready ? "is-ready" : ""}`}>
        {ready ? <CheckCircle2 size={18} /> : <FolderOpen size={18} />}
      </div>
      <div className="picker-copy">
        <div className="picker-title-row">
          <strong>{title}</strong>
          {meta ? <span className="status-chip">{meta}</span> : null}
        </div>
        <span className="picker-description">{description}</span>
        <span className={`picker-path ${path ? "has-value" : ""}`}>{path || "尚未选择"}</span>
      </div>
      <button className="secondary-button" onClick={onChoose} type="button">
        {actionLabel}
      </button>
    </div>
  );
}
