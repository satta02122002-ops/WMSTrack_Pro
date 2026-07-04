import React from 'react'

/** Integrated Service Solutions mark — orange arc wrapping the slate globe. */
export default function Logo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-label="Integrated Service Solutions logo" role="img">
      <path d="M84 19 A 49 49 0 1 0 82 102" fill="none" stroke="#e94e1b" strokeWidth="9" strokeLinecap="round" />
      <circle cx="54" cy="60" r="33" fill="#4e6f80" />
      {/* abstract continents */}
      <path d="M34 50 q5 -12 17 -14 q13 -3 20 3 q-3 7 -13 7 q3 5 -3 9 q-9 5 -14 0 q-5 -2 -7 -5 z" fill="#fff" opacity="0.9" />
      <path d="M51 61 q11 -3 18 3 q6 6 2 14 q-3 8 -11 9 q-7 1 -9 -7 q-2 -9 0 -19 z" fill="#fff" opacity="0.9" />
      <path d="M72 85 l7 3 -2 6 -7 -3 z" fill="#fff" opacity="0.9" />
    </svg>
  )
}
