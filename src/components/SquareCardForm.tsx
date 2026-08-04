/**
 * SquareCardForm — NATIVE stub. Square web checkout only exists on the PWA;
 * iOS/Android use IAP. Metro resolves SquareCardForm.web.tsx on web and this
 * no-op on native, so the shared import in app/subscription.tsx is safe.
 */
export function SquareCardForm(_props: {
  productId: string;
  planName: string;
  priceLabel: string;
  onClose: () => void;
  onSuccess: (tier: string) => void;
}): null {
  return null;
}
