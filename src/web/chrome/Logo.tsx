import { LOGO_SVG } from '../../shared/logo';

/** The mark alone, at whatever size the wordmark next to it calls for. */
export function Logo({ size = 14 }: { size?: number }) {
  return (
    <div
      data-testid="logo-mark"
      aria-hidden="true"
      style={{ width: size, height: size, flex: 'none', marginTop: -2 }}
      dangerouslySetInnerHTML={{ __html: LOGO_SVG }}
    />
  );
}
