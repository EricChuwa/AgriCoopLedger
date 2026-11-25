import { Navigate } from "react-router-dom";

// Adding a farmer now happens in a pop up on the Farmers page. Old links to /farmers/new open it.
export default function AddFarmer() {
  return <Navigate to="/farmers?add=1" replace />;
}
