function login() {
  const user = document.getElementById("username").value.trim();
  const pass = document.getElementById("password").value.trim();
  const error = document.getElementById("loginError");

  if (user === "admin" && pass === "admin") {
    localStorage.setItem("gmu_auth", "true");
    window.location.href = "index.html";
  } else {
    error.textContent = "Invalid username or password";
  }
}

/* 🔑 ENTER KEY SUPPORT */
document.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    login();
  }
});