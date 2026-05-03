import { type AnswerValue, type Question, type MultipleChoiceConfig, type NumericConfig } from '../types'

interface Props {
  question: Question
  value: AnswerValue
  onChange: (value: AnswerValue) => void
  disabled?: boolean
  showCorrect?: boolean
  correctAnswer?: unknown
  pointsAwarded?: number
  adminNote?: string
}

export function QuestionInput({ question, value, onChange, disabled, showCorrect, correctAnswer, adminNote }: Props) {
  const { input_type, input_config_json } = question

  if (input_type === 'multiple_choice') {
    const config = input_config_json as MultipleChoiceConfig
    const options = config.options || []
    const allowMulti = config.allow_multiple_selections
    const selected = (value as { selected?: string | string[] }).selected

    if (allowMulti) {
      // Keep button-style for multi-select (native multi-select is poor on mobile)
      return (
        <div className="space-y-2">
          {options.map((opt, i) => {
            const isSelected = Array.isArray(selected) && selected.includes(opt)
            const isCorrect = showCorrect && Array.isArray(correctAnswer) && (correctAnswer as string[]).includes(opt)

            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => {
                  const curr = Array.isArray(selected) ? selected : []
                  const next = curr.includes(opt) ? curr.filter(s => s !== opt) : [...curr, opt]
                  onChange({ selected: next })
                }}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all font-medium
                  ${isCorrect
                    ? 'border-green-500 bg-green-900/30 text-green-200'
                    : isSelected
                      ? 'border-ocean-400 bg-ocean-600/60 text-ocean-50'
                      : 'border-ocean-600 bg-ocean-700/50 text-ocean-200 hover:border-ocean-500'
                  }
                  ${disabled ? 'cursor-default' : 'cursor-pointer active:scale-98'}`}
              >
                {opt}
              </button>
            )
          })}
          {showCorrect && adminNote && (
            <p className="text-sm text-ocean-300 italic mt-2">📝 {adminNote}</p>
          )}
        </div>
      )
    }

    // Single-select — native dropdown for better mobile experience
    return (
      <div>
        <select
          disabled={disabled}
          value={typeof selected === 'string' ? selected : ''}
          onChange={e => onChange({ selected: e.target.value })}
          className="input"
        >
          <option value="">Choose an answer...</option>
          {options.map((opt, i) => (
            <option key={i} value={opt}>{opt}</option>
          ))}
        </select>
        {showCorrect && correctAnswer != null && (
          <div className="mt-2 space-y-1">
            <p className="text-sm text-green-300">✓ Correct: {String(correctAnswer)}</p>
            {adminNote && <p className="text-sm text-ocean-300 italic">📝 {adminNote}</p>}
          </div>
        )}
      </div>
    )
  }

  if (input_type === 'free_text') {
    const text = (value as { text?: string }).text ?? ''

    return (
      <div>
        <input
          type="text"
          disabled={disabled}
          value={text}
          onChange={e => onChange({ text: e.target.value })}
          placeholder="Type your answer here..."
          className="input"
        />
        {showCorrect && correctAnswer != null && (
          <div className="mt-2 space-y-1">
            <p className="text-sm text-green-300">✓ Correct: {String(correctAnswer)}</p>
            {adminNote && <p className="text-sm text-ocean-300 italic">📝 {adminNote}</p>}
          </div>
        )}
      </div>
    )
  }

  if (input_type === 'numeric') {
    const config = input_config_json as NumericConfig
    const numVal = (value as { value?: number | string }).value ?? ''

    return (
      <div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            disabled={disabled}
            value={numVal}
            min={config.min}
            max={config.max}
            step={config.decimal_places === 0 ? 1 : Math.pow(10, -config.decimal_places)}
            onChange={e => onChange({ value: e.target.value === '' ? '' : Number(e.target.value) })}
            placeholder="Enter a number..."
            className="input max-w-48"
          />
          {config.unit_label && (
            <span className="text-ocean-300 font-medium">{config.unit_label}</span>
          )}
        </div>
        {showCorrect && correctAnswer != null && (
          <div className="mt-2 space-y-1">
            <p className="text-sm text-green-300">
              Correct Answer: {String(correctAnswer)}{config.unit_label ? ` ${config.unit_label}` : ''}
            </p>
            {adminNote && <p className="text-sm text-ocean-300 italic">📝 {adminNote}</p>}
          </div>
        )}
      </div>
    )
  }

  return <p className="text-ocean-400">Unknown question type.</p>
}
