import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDeliveryDialog } from "../context/DeliveryDialogContext.jsx";

// Recording a delivery is now a pop up. An old link or bookmark to /deliveries/new opens it over the deliveries list.
export default function RecordDelivery() {
  const { openDelivery } = useDeliveryDialog();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const farmer = params.get("farmer");
  useEffect(() => {
    navigate("/deliveries", { replace: true });
    openDelivery(farmer ? Number(farmer) : null);
  }, [navigate, openDelivery, farmer]);
  return null;
}
