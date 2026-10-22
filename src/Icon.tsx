type IconName =
  | 'chat'
  | 'plus'
  | 'send'
  | 'back'
  | 'logout'
  | 'search'
  | 'shield'
  | 'arrow'
  | 'close'
  | 'check'
  | 'alert';

const paths: Record<IconName, string> = {
  chat: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-7l-6 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  plus: 'M12 5v14M5 12h14',
  send: 'm4 4 17 8-17 8 3-8-3-8Zm3 8h14',
  back: 'm15 5-7 7 7 7',
  logout: 'M9 4H5v16h4m5-13 5 5-5 5m-5-5h14',
  search: 'm16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  shield: 'm12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6l8-3Zm-4 9 3 3 5-6',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  alert: 'M12 8v5m0 4h.01M10 3 2 18a2 2 0 0 0 2 3h16a2 2 0 0 0 2-3L14 3a2 2 0 0 0-4 0Z',
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
