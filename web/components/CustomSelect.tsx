"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconChevronDown } from "@/components/icons/Icons";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface CustomSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: (string | SelectOption)[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  size?: "sm" | "md";
  menuAlign?: "left" | "right";
}

export function CustomSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Chọn một mục...",
  disabled = false,
  className = "",
  buttonClassName = "",
  dropdownClassName = "",
  size = "md",
  menuAlign = "left",
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize options to SelectOption[]
  const normalizedOptions: SelectOption[] = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const isSmall = size === "sm";

  return (
    <div
      className={`relative ${isOpen ? "z-30" : ""} ${className}`}
      ref={containerRef}
    >
      {label && (
        <label className="mb-1 block font-semibold text-slate-700 text-[11px]">
          {label}
        </label>
      )}

      {/* Button toggle */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-1.5 border text-left shadow-2xs transition outline-none ${
          isSmall
            ? "rounded-lg px-2 py-1 text-[11px] font-medium"
            : "rounded-xl px-3 py-2 text-xs"
        } ${
          isOpen
            ? "border-emerald-500 ring-2 ring-emerald-500/20"
            : "border-slate-200 hover:border-slate-300"
        } ${
          disabled
            ? "opacity-50 cursor-not-allowed bg-slate-50"
            : "cursor-pointer"
        } ${buttonClassName || "bg-white"}`}
      >
        <span
          className={`truncate block ${
            selectedOption
              ? isSmall
                ? "font-medium"
                : "font-medium text-slate-800"
              : "text-slate-400"
          }`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <IconChevronDown
          className={`shrink-0 transition-transform duration-200 ${
            isSmall ? "h-3.5 w-3.5" : "h-4 w-4"
          } ${
            isOpen ? "rotate-180 text-emerald-600" : "text-slate-400"
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl animate-in fade-in zoom-in-95 duration-100 ${
            isSmall
              ? `min-w-[170px] max-w-[260px] text-[11px] ${
                  menuAlign === "right" ? "right-0" : "left-0"
                }`
              : "left-0 right-0 text-xs"
          } ${dropdownClassName}`}
        >
          {normalizedOptions.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={`w-full flex items-center justify-between gap-2 rounded-lg transition cursor-pointer text-left ${
                  isSmall ? "px-2 py-1.5 text-[11px]" : "px-2.5 py-1.5 text-xs"
                } ${
                  isSelected
                    ? "bg-emerald-50 text-emerald-900 font-semibold"
                    : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate">{opt.label}</p>
                  {opt.description && (
                    <p className="text-[10px] text-slate-400 font-normal">
                      {opt.description}
                    </p>
                  )}
                </div>
                {isSelected && (
                  <IconCheck
                    className={`shrink-0 text-emerald-600 ${
                      isSmall ? "h-3 w-3" : "h-3.5 w-3.5"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
