export default function Privacy() {
  return (
    <main className="legal stack">
      <a className="brand" href="/">
        uface
      </a>
      <p className="eyebrow">YOUR DATA, EXPLAINED</p>
      <h1>Privacy, without the fine print.</h1>
      <p>
        UFace is an adult-only, device-local grooming application. There are no
        accounts, advertising trackers, payments, or cloud history.
      </p>
      <h2>What stays on your device</h2>
      <p>
        Your photo is decoded and normalized in your browser, removing embedded
        metadata. A local MediaPipe face model checks the photo and computes
        approximate image-space proportions. The full face mesh is not saved.
        Completed profiles, successful advice, and routine checkmarks are stored
        in this browser’s IndexedDB. Photos are saved there only when you
        explicitly opt in.
      </p>
      <h2>What you choose to send</h2>
      <p>
        Only after you confirm both attestations and press Analyze my photo,
        your normalized photo, questionnaire answers, approximate measurements
        and quality warnings are sent through the UFace server to Google Gemini
        for personalized advice. No analysis upload happens just by selecting a
        photo. You must be 18 or older and use your own photo.
      </p>
      <h2>Provider retention</h2>
      <p>
        UFace does not persist your photos or results on its server, write them
        to logs, or use Google's Files API. Inline requests disable optional
        request logging with store: false; this does not eliminate Google's
        safety or legal retention.
      </p>
      <p>
        The site operator must use a billing-enabled Gemini API project for
        personal photos. Under Google's paid-service terms, prompts and
        responses are not used to improve Google's products, but may be logged
        for a limited period for safety and legal purposes. Unpaid services may
        use inputs and outputs for product improvement and human review; Google
        says not to submit personal, sensitive or confidential information to
        unpaid services. Do not send your photo unless the operator has
        configured paid services. Read{" "}
        <a href="https://ai.google.dev/gemini-api/terms">
          Google's Gemini API data-use terms
        </a>{" "}
        before consenting.
      </p>
      <h2>Storage and deletion</h2>
      <p>
        Anyone using the same browser profile may access your local history and
        saved photos. This is not encrypted cloud backup. Browser-managed
        storage can be cleared or evicted; private browsing may not retain it.
        Settings offers an optional persistent-storage request, but retention is
        not guaranteed.
      </p>
      <p>
        Delete a scan to remove its local report, photo and checkmarks. Delete
        all my data clears all UFace personal data on this device. Deletion
        cannot undo an already transmitted provider request or remove
        browser/operating-system backups. Public offline application assets
        remain cached and contain no personal data.
      </p>
      <a className="button" href="/app?view=settings">
        Open settings
      </a>
      <a href="/">Back to UFace</a>
    </main>
  );
}
