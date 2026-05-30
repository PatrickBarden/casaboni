type BrandLogoProps = {
  subtitle?: string;
  light?: boolean;
  compact?: boolean;
  className?: string;
};

export default function BrandLogo({
  subtitle,
  light = false,
  compact = false,
  className = "",
}: BrandLogoProps) {
  const textColor = light ? "text-white" : "text-primary";
  const borderColor = light ? "border-white/90" : "border-primary";
  const subtitleColor = light ? "text-zinc-300" : "text-outline";
  const boxTextSize = compact ? "text-xl" : "text-2xl";
  const subtitleSize = compact ? "text-[9px]" : "text-[10px]";

  return (
    <div className={`inline-flex flex-col ${className}`}>
      <span
        className={`inline-block border ${borderColor} ${textColor} ${boxTextSize} font-bold leading-none tracking-wider uppercase px-3 py-1.5`}
      >
        CASABONI
      </span>
      {subtitle ? (
        <span className={`${subtitleColor} ${subtitleSize} mt-2 uppercase tracking-[0.22em]`}>
          {subtitle}
        </span>
      ) : null}
    </div>
  );
}
