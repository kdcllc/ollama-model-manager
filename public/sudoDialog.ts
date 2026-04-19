// @ts-nocheck

window.openSudoPasswordDialog = function openSudoPasswordDialog() {
  return new Promise((resolve) => {
    const react = window.React;
    const reactDOM = window.ReactDOM;
    const rootNode = document.getElementById("sudoModalRoot");

    if (!react || !reactDOM || !rootNode) {
      const fallbackDialog = document.createElement("dialog");
      fallbackDialog.className = "sudo-modal";
      fallbackDialog.open = true;

      const fallbackForm = document.createElement("form");
      fallbackForm.method = "dialog";

      const heading = document.createElement("h3");
      heading.textContent = "Sudo Password Required";

      const hint = document.createElement("p");
      hint.className = "sudo-modal-hint";
      hint.textContent =
        "The Ollama update script requires elevated privileges. Enter your sudo password below - it is used only for this operation and is never stored or logged.";

      const label = document.createElement("label");
      label.htmlFor = "sudoPasswordInputFallback";
      label.textContent = "Password";

      const input = document.createElement("input");
      input.type = "password";
      input.id = "sudoPasswordInputFallback";
      input.autocomplete = "current-password";
      input.placeholder = "Enter sudo password";

      const actions = document.createElement("div");
      actions.className = "sudo-modal-actions";

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.id = "sudoCancelBtn";
      cancelButton.className = "btn";
      cancelButton.textContent = "Cancel";

      const confirmButton = document.createElement("button");
      confirmButton.type = "submit";
      confirmButton.id = "sudoConfirmBtn";
      confirmButton.className = "btn btn-warning";
      confirmButton.textContent = "Run Update";

      actions.appendChild(cancelButton);
      actions.appendChild(confirmButton);
      fallbackForm.appendChild(heading);
      fallbackForm.appendChild(hint);
      fallbackForm.appendChild(label);
      fallbackForm.appendChild(input);
      fallbackForm.appendChild(actions);
      fallbackDialog.appendChild(fallbackForm);
      document.body.appendChild(fallbackDialog);

      const cleanupFallback = (value) => {
        fallbackDialog.remove();
        resolve(value);
      };

      fallbackForm.addEventListener("submit", (event) => {
        event.preventDefault();
        cleanupFallback(String(input.value));
      });

      cancelButton.addEventListener("click", () => {
        cleanupFallback(null);
      });

      fallbackDialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        cleanupFallback(null);
      });

      input.focus();
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
