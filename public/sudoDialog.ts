// @ts-nocheck

window.openSudoPasswordDialog = function openSudoPasswordDialog() {
  return new Promise((resolve) => {
    const react = window.React;
    const reactDOM = window.ReactDOM;
    const rootNode = document.getElementById("sudoModalRoot");

    if (!react || !reactDOM || !rootNode) {
      const fallback = prompt("Enter sudo password to update Ollama runtime:", "");
      resolve(fallback === null ? null : String(fallback));
      return;
    }

    const root = reactDOM.createRoot(rootNode);
    const cleanup = (value) => {
      root.unmount();
      resolve(value);
    };

    const SudoPasswordDialog = () => {
      const [password, setPassword] = react.useState("");
      const inputRef = react.useRef(null);

      react.useEffect(() => {
        inputRef.current?.focus();
      }, []);

      const onSubmit = (event) => {
        event.preventDefault();
        cleanup(password);
      };

      const onCancel = (event) => {
        event.preventDefault();
        cleanup(null);
      };

      return react.createElement(
        "dialog",
        {
          className: "sudo-modal",
          open: true,
          onCancel
        },
        react.createElement(
          "form",
          { method: "dialog", onSubmit },
          react.createElement("h3", null, "Sudo Password Required"),
          react.createElement(
            "p",
            { className: "sudo-modal-hint" },
            "The Ollama update script requires elevated privileges. Enter your sudo password below - it is used only for this operation and is never stored or logged."
          ),
          react.createElement("label", { htmlFor: "sudoPasswordInputReact" }, "Password"),
          react.createElement("input", {
            type: "password",
            id: "sudoPasswordInputReact",
            autoComplete: "current-password",
            placeholder: "Enter sudo password",
            value: password,
            ref: inputRef,
            onChange: (event) => setPassword(event.target.value)
          }),
          react.createElement(
            "div",
            { className: "sudo-modal-actions" },
            react.createElement(
              "button",
              { type: "button", id: "sudoCancelBtn", className: "btn", onClick: () => cleanup(null) },
              "Cancel"
            ),
            react.createElement(
              "button",
              { type: "submit", id: "sudoConfirmBtn", className: "btn btn-warning" },
              "Run Update"
            )
          )
        )
      );
    };

    root.render(react.createElement(SudoPasswordDialog));
  });
};
