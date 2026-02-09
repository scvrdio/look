"use client";

type FormFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  type?: string;
  error?: string | null;
  disabled?: boolean;
  labelRight?: React.ReactNode;
  onBlur?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  dataName?: string;
};

export function FormField({
  label,
  labelRight,
  value,
  onChange,
  onBlur,
  onKeyDown,
  placeholder,
  inputMode,
  type = "text",
  error,
  dataName,
  disabled,
}: FormFieldProps) {
  return (
    <div className="space-y-1">
      <div className="text-[16px] font-[400] text-black/50 px-1">{label}</div>
      <div className="relative">
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`
      h-12 w-full rounded-2xl px-4 text-[16px] font-medium outline-[1px] outline-black/5
      placeholder:text-black/30
      ${error ? "bg-red-50" : "bg-[#F5F5F5]"}
      disabled:opacity-60
      ${labelRight ? "pr-14" : ""}
    `}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          data-name={dataName}

        />

        {labelRight ? (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            {labelRight}
          </div>
        ) : null}
      </div>


      {error && (
        <div className="text-[12px] text-red-500">{error}</div>
      )}
    </div>
  );
}
