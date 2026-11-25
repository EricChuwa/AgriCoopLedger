import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePaymentDialog } from "../context/PaymentDialogContext.jsx";

// Recording a payment is a pop up. An old link or bookmark to /payments/new opens it over the payments list.
export default function RecordPayment() {
  const { openPayment } = usePaymentDialog();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const farmer = params.get("farmer");
  useEffect(() => {
    navigate("/payments", { replace: true });
    openPayment(farmer ? Number(farmer) : null);
  }, [navigate, openPayment, farmer]);
  return null;
}
