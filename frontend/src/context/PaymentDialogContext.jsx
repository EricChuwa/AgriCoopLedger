import { createContext, useCallback, useContext, useMemo, useState } from "react";
import Dialog from "../components/Dialog.jsx";
import RecordPaymentFlow from "../components/RecordPaymentFlow.jsx";
import "../styles/dialog-form.css";

const PaymentDialogContext = createContext({ openPayment: () => {} });

// Recording a payment happens in a pop up over whatever page the Payment Officer is on.
// Anything can call openPayment(farmerId) to open it, with the farmer already chosen if one is given.
export function PaymentDialogProvider({ children }) {
  const [state, setState] = useState(null); // null = closed, otherwise { farmerId }
  const openPayment = useCallback((farmerId = null) => setState({ farmerId }), []);
  const close = useCallback(() => setState(null), []);
  const value = useMemo(() => ({ openPayment }), [openPayment]);

  return (
    <PaymentDialogContext.Provider value={value}>
      {children}
      {state && (
        <Dialog title="Record payment" onClose={close} wide keepOnBackdrop>
          <p className="dialog-lead">Money paid to a farmer. It is taken off what they are owed.</p>
          <RecordPaymentFlow farmerId={state.farmerId} onClose={close} />
        </Dialog>
      )}
    </PaymentDialogContext.Provider>
  );
}

export const usePaymentDialog = () => useContext(PaymentDialogContext);
