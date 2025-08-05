import type { SVGProps } from 'react';
import { cn } from "@/lib/utils";

interface RobotIdeaIconProps extends SVGProps<SVGSVGElement> {
  animateLamp?: boolean;
}

export function RobotIdeaIcon({ animateLamp = true, className, ...props }: RobotIdeaIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 28"
      fill="none"
      className={className}
      {...props}
    >
      <g transform="translate(0, 1.5)">
        <circle cx="12" cy="6.5" r="5.5" fill="#FFFFE0" opacity="0.3"/>
        <circle cx="12" cy="6.5" r="4.5" fill="#FFFFE0" opacity="0.5"/>

        <path
          d="M12 11.5C9.23858 11.5 7 9.26142 7 6.5C7 3.73858 9.23858 1.5 12 1.5C14.7614 1.5 17 3.73858 17 6.5C17 9.26142 14.7614 11.5 12 11.5Z"
          stroke="#374151"
          strokeWidth="0.75"
          fill="rgba(209, 213, 219, 0.3)"
        />
        <path
          d="M10.5 7.5L11.25 5L12 7.5L12.75 5L13.5 7.5"
          stroke="#FFE066"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <path
        d="M9.5 12.5 H14.5 V14.0 H9.5 Z"
        fill="#6B7280"
        stroke="#374151"
        strokeWidth="0.6" 
      />
       <path
        d="M9.5 14.0 C9.5 14.5 10 14.5 10.5 14.5 H13.5 C14 14.5 14.5 14.5 14.5 14.0 L14 13.75 H10 L9.5 14.0 Z"
        fill="#6B7280"
        stroke="#374151"
        strokeWidth="0.6" 
      />
      <line x1="9.5" y1="13.0" x2="14.5" y2="13.0" stroke="#4B5563" strokeWidth="0.5"/>
      <line x1="9.5" y1="13.5" x2="14.5" y2="13.5" stroke="#4B5563" strokeWidth="0.5"/>

      <rect
        x="4"
        y="14.5"
        width="16"
        height="8.5"
        rx="3.5"
        fill="#E5E7EB"
        stroke="#6B7280"
        strokeWidth="1"
      />
      <rect
        x="2.5"
        y="16"
        width="2"
        height="5.5"
        rx="1.5"
        fill="#9CA3AF"
        stroke="#4B5563"
        strokeWidth="0.75"
      />
      <rect
        x="19.5"
        y="16"
        width="2"
        height="5.5"
        rx="1.5"
        fill="#9CA3AF"
        stroke="#4B5563"
        strokeWidth="0.75"
      />

      <circle cx="8.5" cy="18.75" r="1.8" fill="#DFB87F" />
      <circle cx="8.0" cy="18.25" r="0.5" fill="#FFFFFF" opacity="0.9" />
      
      <circle cx="15.5" cy="18.75" r="1.8" fill="#DFB87F" />
      <circle cx="15.0" cy="18.25" r="0.5" fill="#FFFFFF" opacity="0.9" />

    </svg>
  );
}
