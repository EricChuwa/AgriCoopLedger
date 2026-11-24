// Prototype only: validates in the browser and stores nothing.
(function () {
  var form = document.getElementById("signup");
  var card = document.getElementById("card");

  var ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 16.5v.5"/></svg>';

  // Rwandan mobile numbers: 07X XXX XXX, with MTN (78, 79) and Airtel (72, 73)
  var PHONE = /^7[2389]\d{7}$/;

  var rules = {
    name: function (v) {
      return v.trim().length < 2 ? "Enter your full name." : "";
    },
    phone: function (v) {
      var digits = v.replace(/[\s-]/g, "").replace(/^(\+?250|0)/, "");
      return PHONE.test(digits)
        ? ""
        : "Enter a Rwandan mobile number, for example 788 123 456.";
    },
    coop: function (v) {
      return v.trim().length < 2 ? "Enter your cooperative's name." : "";
    },
    role: function (v) {
      return v ? "" : "Select your role.";
    },
    password: function (v) {
      return v.length < 8 ? "Use at least 8 characters." : "";
    },
    confirm: function (v) {
      return v !== form.password.value ? "Passwords do not match." : "";
    }
  };

  function check(name) {
    var field = form.querySelector('[data-field="' + name + '"]');
    var msg = rules[name](form[name].value);
    var out = document.getElementById(name + "-error");
    field.classList.toggle("invalid", !!msg);
    form[name].setAttribute("aria-invalid", msg ? "true" : "false");
    out.innerHTML = msg ? ICON + "<span>" + msg + "</span>" : "";
    return !msg;
  }

  Object.keys(rules).forEach(function (name) {
    form[name].addEventListener("blur", function () {
      if (form[name].value !== "" || name === "role") check(name);
    });
    form[name].addEventListener("input", function () {
      if (form.querySelector('[data-field="' + name + '"]').classList.contains("invalid")) check(name);
    });
  });

  var toggle = document.getElementById("toggle");
  toggle.addEventListener("click", function () {
    var show = form.password.type === "password";
    form.password.type = show ? "text" : "password";
    toggle.textContent = show ? "Hide" : "Show";
    toggle.setAttribute("aria-pressed", show ? "true" : "false");
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var firstBad = null;
    Object.keys(rules).forEach(function (name) {
      if (!check(name) && !firstBad) firstBad = form[name];
    });
    if (firstBad) { firstBad.focus(); return; }

    var first = form.name.value.trim().split(/\s+/)[0];
    document.getElementById("done-text").textContent =
      first + ", your account for " + form.coop.value.trim() + " is ready. Sign in to continue.";
    card.classList.add("is-done");
  });
})();
