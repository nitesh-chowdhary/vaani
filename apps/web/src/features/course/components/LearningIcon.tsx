import type { SVGProps } from 'react';

export type IconName =
  | 'voice'
  | 'mic'
  | 'check'
  | 'close'
  | 'arrow'
  | 'back'
  | 'sound'
  | 'refresh'
  | 'help'
  | 'headphones'
  | 'pause'
  | 'leaf';
const paths: Record<IconName, string> = {
  voice: 'M4 10v4m4-7v10m4-13v16m4-13v10m4-7v4',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11v1a7 7 0 0 0 14 0v-1M12 19v3M8 22h8',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  back: 'M20 12H4m6-6-6 6 6 6',
  sound: 'm11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  refresh:
    'M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 14-1l1 1M4 17l1 1a8 8 0 0 0 14-1',
  help: 'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 18h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
  headphones: 'M4 13v-1a8 8 0 0 1 16 0v1M4 12H3v8h4v-8H4Zm16 0h1v8h-4v-8h3Z',
  pause: 'M9 5v14M15 5v14',
  leaf: 'M5 20c1-7 6-11 13-14M5 17C1 4 11 2 21 3c0 12-5 17-16 14Z',
};
export function LearningIcon({
  name,
  ...props
}: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
