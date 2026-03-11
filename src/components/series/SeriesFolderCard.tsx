"use client";

type SeriesFolderCardProps = {
  title: string;
  count: number;
  posters?: Array<{ id: string; posterUrl: string | null; title: string }>;
  onClick?: () => void;
};

export function SeriesFolderCard({
  title,
  count,
  posters = [],
  onClick,
}: SeriesFolderCardProps) {
  const visiblePosters = posters.filter((item) => item.posterUrl).slice(-3);
  const remainingCount = Math.max(0, count - 3);
  const className = [
    "h-[136px] w-full rounded-[24px] pt-[14px] pb-[14px] pl-4 pr-[14px]",
    "flex flex-col justify-between",
    "bg-black/[0.05]",
  ].join(" ");

  const content = (
    <>
      <div
        className="text-[16px] leading-[1.04] text-black"
        style={{ fontVariationSettings: '"wdth" 90, "wght" 500, "opsz" 22' }}
      >
        {title}
      </div>

      <div className="flex items-end justify-between">
        <div
          className="text-[88px] leading-[0.78] text-black"
          style={{ fontVariationSettings: '"wdth" 75, "wght" 400, "opsz" 56', fontStretch: "75%" }}
        >
          {count}
        </div>

        <div className="flex items-center">
          {visiblePosters.map((item, index) => (
            <div
              key={item.id}
              className={[
                "h-6 w-6 overflow-hidden rounded-full border-2 border-[#f2f2f2] bg-[#FFF5F2]",
                index === 0 ? "" : "-ml-2",
              ].join(" ")}
            >
              <img
                src={item.posterUrl ?? ""}
                alt={item.title}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            </div>
          ))}
          {remainingCount > 0 ? (
            <div
              className={[
                "flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#f2f2f2] bg-[#ffffff] text-black/50 pr-0.5",
                "text-[12px] font-semibold",
                visiblePosters.length > 0 ? "-ml-2" : "",
              ].join(" ")}
              style={{ letterSpacing: "-0.08em" }}
            >
              +{remainingCount}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${className} text-left transition active:scale-[0.99]`}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
