
/**
 * Integrated Service Solutions mark — thin orange arc (open to the right)
 * around a gray Europe/Africa/Asia globe silhouette, matching the company logo.
 */
export default function Logo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-label="Integrated Service Solutions logo" role="img">
      {/* orange arc, opening on the right */}
      <path
        d="M87.8 15.4 A52 52 0 1 0 91.4 97.8"
        fill="none"
        stroke="#f0511c"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <g fill="#adb5bd">
        {/* Eurasia */}
        <path d="M26 50
                 C24 42 28 33 36 29
                 L40 31 L43 25
                 C49 20 57 18 63 20
                 L64 25 L69 20
                 C80 17 91 22 96 30
                 C100 37 101 45 97 50
                 L91 49 L93 55
                 C91 60 85 61 81 57
                 L79 63
                 C76 69 71 70 68 64
                 L66 57 L62 61
                 C59 64 55 62 54 58
                 L50 55
                 L45 57 L41 53 L36 55 L31 53 Z" />
        {/* Africa */}
        <path d="M40 59
                 L48 56 L56 59
                 C60 62 61 67 58 71
                 L64 74 L58 77
                 C58 85 55 93 51 97
                 C47 99 44 94 45 89
                 C40 86 37 80 38 74
                 C35 69 34 63 37 60 Z" />
        {/* Arabia */}
        <path d="M60 62 L69 65 L66 74 L59 68 Z" />
        {/* Madagascar */}
        <path d="M61 89 q3 -2 4 1.5 q1 4 -2.5 6 q-3 -2 -1.5 -7.5 z" />
        {/* British Isles */}
        <path d="M39 26 q2.5 -5 7 -5 q0 4.5 -3.5 6.5 q-2.5 1 -3.5 -1.5 z" />
      </g>
    </svg>
  )
}
