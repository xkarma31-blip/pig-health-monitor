import { useState } from 'react';

export interface OtaDialogProps {
  accessible?: boolean;
  className?: string;
  /** Optional — called when the user cancels or finishes the update. */
  onClose?: () => void;
}

export function OtaDialog({
  accessible = false,
  className = '',
  onClose
}: OtaDialogProps) {
  const [updating, setUpdating] = useState(false);

  const close = () => {
    setUpdating(false);
    onClose?.();
  };

  return (
    <div
      className={`ota-dialog ${accessible ? 'accessible' : ''} ${className}`}
      data-testid="ota-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="OTA update dialog"
    >
      <div className="ota-dialog-content">
        <span className="ota-dialog-title">OTA Update</span>
        {updating ? (
          <>
            <p className="ota-dialog-message" data-testid="ota-progress">
              Updating firmware… keep the device within range of the gateway.
            </p>
            <div className="ota-dialog-actions">
              <button
                data-testid="ota-done"
                aria-label="Close OTA dialog"
                onClick={close}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="ota-dialog-message">
              A new firmware version is available. Would you like to update now?
            </p>
            <div className="ota-dialog-actions">
              <button
                data-testid="ota-cancel"
                aria-label="Cancel OTA update"
                onClick={close}
                style={{ marginRight: '1rem' }}
              >
                Cancel
              </button>
              <button
                data-testid="ota-confirm"
                aria-label="Confirm OTA update"
                onClick={() => setUpdating(true)}
              >
                Update
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}