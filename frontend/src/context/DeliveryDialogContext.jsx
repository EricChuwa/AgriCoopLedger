import { createContext, useCallback, useContext, useMemo, useState } from "react";
import Dialog from "../components/Dialog.jsx";
import RecordDeliveryFlow from "../components/RecordDeliveryFlow.jsx";
import "../styles/dialog-form.css";

const DeliveryDialogContext = createContext({ openDelivery: () => {} });

// Recording a delivery happens in a pop up over whatever page the Clerk is on.
// Anything can call openDelivery(farmerId) to open it, with the farmer already chosen if one is given.
export function DeliveryDialogProvider({ children }) {
  const [state, setState] = useState(null); // null = closed, otherwise { farmerId }
  const openDelivery = useCallback((farmerId = null) => setState({ farmerId }), []);
  const close = useCallback(() => setState(null), []);
  const value = useMemo(() => ({ openDelivery }), [openDelivery]);

  return (
    <DeliveryDialogContext.Provider value={value}>
      {children}
      {state && (
        <Dialog title="Record delivery" onClose={close} wide keepOnBackdrop>
          <RecordDeliveryFlow farmerId={state.farmerId} onClose={close} />
        </Dialog>
      )}
    </DeliveryDialogContext.Provider>
  );
}

export const useDeliveryDialog = () => useContext(DeliveryDialogContext);
