
/** Warehouse / contract-logistics silhouette scene for the login background. */
export default function WarehouseBackdrop() {
  return (
    <svg
      className="login-backdrop"
      viewBox="0 0 1440 430"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <g fill="#ffffff">
        {/* ground */}
        <rect x="0" y="404" width="1440" height="5" opacity="0.2" />

        {/* gantry crane over container stack (left) */}
        <g opacity="0.13">
          <rect x="60" y="120" width="14" height="284" />
          <rect x="420" y="120" width="14" height="284" />
          <rect x="40" y="104" width="414" height="16" />
          <rect x="240" y="120" width="6" height="60" />
          <rect x="206" y="180" width="74" height="34" />
        </g>
        {/* container stack */}
        <g opacity="0.11">
          {[0, 1, 2].map((row) =>
            [0, 1, 2].map((col) => (
              <rect key={`${row}-${col}`} x={100 + col * 100} y={310 - row * 42} width="92" height="36" rx="2" />
            )),
          )}
          <rect x="200" y="184" width="92" height="36" rx="2" opacity="0" />
        </g>
        {/* corrugation lines on containers (cut look) */}
        <g opacity="0.07">
          {[0, 1, 2].map((row) =>
            [0, 1, 2].map((col) => (
              <g key={`c${row}-${col}`}>
                <rect x={112 + col * 100} y={314 - row * 42} width="3" height="28" />
                <rect x={136 + col * 100} y={314 - row * 42} width="3" height="28" />
                <rect x={160 + col * 100} y={314 - row * 42} width="3" height="28" />
              </g>
            )),
          )}
        </g>

        {/* forklift (center-left) carrying a box */}
        <g opacity="0.14">
          <rect x="560" y="330" width="90" height="44" rx="6" />
          <path d="M560 336 h-8 v66 h8 z" />
          <rect x="536" y="392" width="40" height="7" rx="2" />
          <rect x="540" y="352" width="26" height="26" rx="2" />
          <circle cx="580" cy="392" r="14" />
          <circle cx="638" cy="392" r="14" />
          <path d="M600 330 v-28 h34 v10 h-24 v18 z" />
        </g>

        {/* pallet with boxes (center) */}
        <g opacity="0.1">
          <rect x="700" y="392" width="90" height="10" rx="2" />
          <rect x="706" y="360" width="36" height="30" rx="2" />
          <rect x="746" y="360" width="36" height="30" rx="2" />
          <rect x="724" y="328" width="38" height="30" rx="2" />
        </g>

        {/* truck with container trailer (center-right) */}
        <g opacity="0.12">
          <rect x="830" y="316" width="150" height="60" rx="3" />
          <rect x="988" y="336" width="46" height="40" rx="5" />
          <rect x="994" y="342" width="24" height="16" rx="2" opacity="0.8" />
          <circle cx="862" cy="388" r="13" />
          <circle cx="906" cy="388" r="13" />
          <circle cx="1006" cy="388" r="13" />
          <rect x="842" y="322" width="3" height="48" opacity="0.6" />
          <rect x="866" y="322" width="3" height="48" opacity="0.6" />
          <rect x="890" y="322" width="3" height="48" opacity="0.6" />
          <rect x="914" y="322" width="3" height="48" opacity="0.6" />
          <rect x="938" y="322" width="3" height="48" opacity="0.6" />
        </g>

        {/* warehouse building with dock doors (right) */}
        <g opacity="0.11">
          <path d="M1080 404 V236 L1250 176 L1420 236 V404 Z" />
        </g>
        <g opacity="0.16">
          <rect x="1110" y="300" width="64" height="104" rx="2" />
          <rect x="1218" y="300" width="64" height="104" rx="2" />
          <rect x="1326" y="300" width="64" height="104" rx="2" />
          <rect x="1110" y="316" width="64" height="4" opacity="0.6" />
          <rect x="1218" y="316" width="64" height="4" opacity="0.6" />
          <rect x="1326" y="316" width="64" height="4" opacity="0.6" />
          <rect x="1110" y="336" width="64" height="4" opacity="0.6" />
          <rect x="1218" y="336" width="64" height="4" opacity="0.6" />
          <rect x="1326" y="336" width="64" height="4" opacity="0.6" />
        </g>

        {/* cargo plane + route dots (top-right sky) */}
        <g opacity="0.1">
          <path d="M1240 78 l54 14 -6 10 -58 -6 -26 24 -12 -2 14 -28 -30 -8 6 -8 34 2 18 -20 12 2 z" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <circle key={i} cx={1150 - i * 46} cy={96 + i * 10} r="3.5" />
          ))}
        </g>

        {/* ship on the far left horizon */}
        <g opacity="0.09">
          <path d="M20 210 h150 l-18 26 h-114 z" />
          <rect x="52" y="176" width="30" height="34" rx="2" />
          <rect x="88" y="188" width="26" height="22" rx="2" />
          <rect x="118" y="188" width="26" height="22" rx="2" />
        </g>
      </g>
    </svg>
  )
}
