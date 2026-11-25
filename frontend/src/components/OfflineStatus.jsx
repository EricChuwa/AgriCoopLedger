import { useDeliveryDialog } from "../context/DeliveryDialogContext.jsx";
import { useOffline } from "../context/OfflineContext.jsx";
import { plural } from "../lib/format.js";
import "../styles/offline.css";

// A strip at the top of a Clerk's pages that says when there is no connection and when deliveries are waiting
// to be sent (FR 4.9). It says nothing when everything is sent and the connection is fine.
export default function OfflineStatus() {
  const { online, waiting, refused, syncing, sync } = useOffline();
  const { openDelivery } = useDeliveryDialog();
  if (online && waiting === 0 && refused === 0) return null;

  return (
    <div className={`offline-strip${online ? "" : " is-offline"}`} role="status" aria-live="polite">
      <p>
        {!online && <strong>You are offline. </strong>}
        {!online && waiting === 0 && "Deliveries you record are kept on this device and sent when the connection returns."}
        {waiting > 0 && `${waiting} ${plural(waiting, "delivery is", "deliveries are")} saved on this device, waiting to be sent.`}
        {refused > 0 && ` ${refused} ${plural(refused, "was", "were")} not accepted by the server.`}
      </p>
      <div className="offline-actions">
        {waiting > 0 && online && (
          <button type="button" className="btn btn-outline btn-small" onClick={() => sync()} disabled={syncing}>
            {syncing ? "Sending" : "Send now"}
          </button>
        )}
        {(waiting > 0 || refused > 0) && <button type="button" className="btn btn-outline btn-small" onClick={() => openDelivery()}>Review</button>}
      </div>
    </div>
  );
}
