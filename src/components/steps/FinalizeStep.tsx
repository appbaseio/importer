export default function FinalizeStep() {
  return (
    <div className="text-sm text-neutral-700">
      You can now query your index. Consider switching to NDJSON for larger
      files or enabling a relay for CORS/auth hardening in a future version.
    </div>
  );
}
