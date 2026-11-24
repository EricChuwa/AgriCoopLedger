import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import FarmerForm from "../components/FarmerForm.jsx";
import Icon from "../components/Icon.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { formatPhone } from "../lib/format.js";

const EMPTY = { name: "", national_id: "", phone: "", village: "", member_since: "" };

function Added({ farmer, onAnother, isClerk }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const first = farmer.full_name.split(" ")[0];

  return (
    <div className="record record-single">
      <section className="done" aria-labelledby="done-title">
        <span className="done-mark"><Icon name="check" size={26} /></span>
        <h2 id="done-title" tabIndex={-1} ref={heading}>Farmer added</h2>
        <p className="done-lead">
          {farmer.full_name}{farmer.village ? `, ${farmer.village}` : ""}{farmer.phone ? `, ${formatPhone(farmer.phone)}` : ""}.
        </p>
        <p className="done-owed">They start with nothing owed.</p>
        <div className="done-actions">
          {isClerk && <Link className="btn btn-primary" to={`/deliveries/new?farmer=${farmer.id}`}>Record {first}'s first delivery</Link>}
          <button className="btn btn-outline" type="button" onClick={onAnother}>Add another farmer</button>
        </div>
        <Link className="done-link" to="/farmers">Back to farmers</Link>
      </section>
    </div>
  );
}

export default function AddFarmer() {
  const { user } = useAuth();
  const { addFarmer } = useLedger();
  const [added, setAdded] = useState(null);

  const handleSubmit = async (body) => {
    const result = await addFarmer(body);
    if (result.data) setAdded(result.data);
    return result;
  };

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Add farmer</h1>
          <p>Register a farmer so you can record their deliveries and payments.</p>
        </div>
      </header>
      {added
        ? <Added farmer={added} isClerk={user.role === "clerk"} onAnother={() => setAdded(null)} />
        : <div className="record record-single"><FarmerForm initial={EMPTY} submitLabel="Add farmer" onSubmit={handleSubmit} /></div>}
    </div>
  );
}
