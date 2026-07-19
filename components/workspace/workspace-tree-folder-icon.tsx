'use client';

import * as React from 'react';
import { FolderClosed } from 'lucide-react';

import { cn } from '@/lib/utils';

export function WorkspaceTreeFolderIcon({
  expanded,
  className,
  ...props
}: React.SVGProps<SVGSVGElement> & { expanded: boolean }) {
  if (!expanded) {
    return (
      <FolderClosed
        aria-hidden="true"
        className={cn('size-[13px] shrink-0', className)}
        size={13}
        {...props}
      />
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={cn('size-[13px] shrink-0', className)}
      fill="currentColor"
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M896 384.298667c58.432 4.266667 96.746667 55.893333 83.2 114.496l-69.824 301.653333C896.896 854.336 844.714667 896 789.418667 896H234.581333c-55.168 0-107.498667-41.706667-119.936-95.552L44.8 498.794667c-13.546667-58.602667 24.874667-110.208 83.2-114.496v-149.717334A106.666667 106.666667 0 0 1 234.688 128H443.733333a42.666667 42.666667 0 0 1 35.498667 18.986667l55.594667 83.413333h254.293333A106.858667 106.858667 0 0 1 896 337.109333v47.189334zM810.666667 384v-46.890667c0-11.733333-9.664-21.376-21.546667-21.376H512a42.666667 42.666667 0 0 1-35.498667-18.986666L420.906667 213.333333H234.666667a21.333333 21.333333 0 0 0-21.354667 21.248V384h597.333333zM197.76 781.226667c3.52 15.168 21.418667 29.44 36.821333 29.44h554.837334c15.509333 0 33.28-14.186667 36.821333-29.44l69.824-301.674667c1.792-7.808-0.128-10.218667-7.978667-10.218667H135.936c-7.808 0-9.770667 2.474667-7.978667 10.218667l69.824 301.653333z" />
    </svg>
  );
}
