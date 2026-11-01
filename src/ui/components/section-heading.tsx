import type { ReactNode } from "react";

export const SectionHeading = ({
  title,
  meta,
  id,
  tabIndex,
}: {
  title: ReactNode;
  meta?: ReactNode;
  id?: string;
  tabIndex?: number;
}) => (
  <div className="dd-section-heading">
    <h2 id={id} tabIndex={tabIndex}>
      {title}
    </h2>
    {meta && <span className="dd-section-meta">{meta}</span>}
  </div>
);
