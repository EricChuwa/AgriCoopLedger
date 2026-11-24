export default function PhoneInput(props) {
  return (
    <div className="phone">
      <span className="prefix" aria-hidden="true">+250</span>
      <input {...props} type="tel" inputMode="numeric" autoComplete="tel-national"
        placeholder="788 123 456" />
    </div>
  );
}
