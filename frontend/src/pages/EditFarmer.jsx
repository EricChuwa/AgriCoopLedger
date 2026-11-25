import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import Dialog from "../components/Dialog.jsx";
import FarmerForm from "../components/FarmerForm.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { fmt, formatPhone } from "../lib/format.js";

export default function EditFarmer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { farmers, updateFarmer, setFarmerActive } = useLedger();
  const farmer = farmers.find((f) => String(f.id) === id);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  if (!farmer || user.role === "payment_officer") {
    return (
      <div>
        <header className="page-head"><div><h1>{farmer ? "Not allowed" : "Farmer not found"}</h1>
          <p>{farmer ? "Your role cannot edit farmers." : "This farmer does not exist."}</p></div></header>
        <Link className="btn btn-outline" to="/farmers">Back to farmers</Link>
      </div>
    );
  }

  const isManager = user.role === "manager";
  const initial = {
    name: farmer.full_name, national_id: farmer.national_id,
    phone: farmer.phone ? formatPhone(farmer.phone).slice(1) : "", village: farmer.village,
    member_since: farmer.member_since,
  };

  const handleSubmit = async (body) => {
    const result = await updateFarmer(farmer.id, body);
    if (result.data) navigate(`/farmers/${farmer.id}`);
    return result;
  };

  const handleActive = async (active) => {
    const result = await setFarmerActive(farmer.id, active);
    setConfirming(false);
    if (result.error) { setError(result.error.message); return; }
    navigate(`/farmers/${farmer.id}`);
  };

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Edit {farmer.full_name}</h1>
          <p>Changes to a farmer's details never change their deliveries or payments.</p>
        </div>
      </header>

      <div className="record record-single">
        <FarmerForm initial={initial} submitLabel="Save changes" onSubmit={handleSubmit} />

        {isManager && farmer.enrolment === "approved" && (
          <section className="danger-zone" aria-labelledby="status-title">
            <h2 id="status-title">{farmer.is_active ? "Deactivate farmer" : "Reactivate farmer"}</h2>
            {farmer.is_active ? (
              <p>
                A deactivated farmer is hidden when recording deliveries and payments. Their history is kept.
                {farmer.balance > 0 && <> This farmer is owed {fmt(farmer.balance)} RWF, so a payment must be recorded first.</>}
              </p>
            ) : (
              <p>This farmer is inactive. Reactivate them to record new deliveries or payments.</p>
            )}
            <Alert>{error}</Alert>
            {farmer.is_active
              ? <button className="btn btn-outline" type="button" onClick={() => setConfirming(true)}>Deactivate farmer</button>
              : <button className="btn btn-primary" type="button" onClick={() => handleActive(true)}>Reactivate farmer</button>}
          </section>
        )}
      </div>

      {confirming && (
        <Dialog title={`Deactivate ${farmer.full_name}?`} onClose={() => setConfirming(false)}>
          <p className="dialog-lead">They will no longer appear when recording deliveries or payments. You can reactivate them later.</p>
          <div className="dialog-actions">
            <button className="btn btn-danger" type="button" onClick={() => handleActive(false)}>Deactivate</button>
            <button className="btn btn-outline" type="button" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
