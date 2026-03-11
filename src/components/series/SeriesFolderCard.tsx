"use client";

type SeriesFolderCardProps = {
  title: string;
  count: number;
  posters?: Array<{ id: string; posterUrl: string | null; title: string }>;
  tone: "neutral" | "accent";
  onClick?: () => void;
};

export function SeriesFolderCard({
  title,
  count,
  posters = [],
  tone,
  onClick,
}: SeriesFolderCardProps) {
  const visiblePosters = posters.filter((item) => item.posterUrl).slice(0, 4);
  const isNeutral = tone === "neutral";
  const className = [
    "h-[144px] w-full rounded-[24px] pt-[14px] pb-[14px] pl-4 pr-[14px]",
    "flex flex-col justify-between",
    isNeutral ? "bg-black/[0.05]" : "bg-[#FF3D00]/[0.05]",
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
                "h-5 w-5 overflow-hidden rounded-full border-2 border-[#FFF5F2] bg-[#FFF5F2]",
                index === 0 ? "" : "-ml-1",
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
