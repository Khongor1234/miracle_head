import './JudgeReport.css';

export default function JudgeReport({ result }) {
  const { facets = [], winner, summary, total_model1, total_model2, model1_name, model2_name, judge_model } = result;

  const winnerSide =
    winner === model1_name ? 'a' :
    winner === model2_name ? 'b' :
    'draw';

  const maxTotal = facets.length * 10;

  return (
    <div className="judge-report">

      {/* Verdict banner */}
      <div className={`verdict-banner verdict-${winnerSide}`}>
        <div className="verdict-eyebrow">Verdict</div>
        <div className="verdict-winner">
          {winnerSide === 'draw' ? 'Draw' : winner}
          {winnerSide !== 'draw' && <span className="verdict-wins-label"> wins</span>}
        </div>
        <div className="verdict-scores">
          <span className={`verdict-score-num ${winnerSide === 'a' ? 'score-leader' : ''}`}>
            {total_model1}
          </span>
          <span className="verdict-score-sep">—</span>
          <span className={`verdict-score-num ${winnerSide === 'b' ? 'score-leader' : ''}`}>
            {total_model2}
          </span>
        </div>
        <p className="verdict-summary">{summary}</p>
      </div>

      {/* Score table */}
      <div className="scorecard">
        <div className="scorecard-header">
          <div className="sc-criterion">Criterion</div>
          <div className="sc-side sc-side-a">{model1_name}</div>
          <div className="sc-side sc-side-b">{model2_name}</div>
        </div>

        {facets.map((facet) => {
          const aWins = facet.model1_score > facet.model2_score;
          const bWins = facet.model2_score > facet.model1_score;
          return (
            <div className="sc-row" key={facet.name}>
              <div className="sc-criterion">
                <span className="sc-facet-name">{facet.name}</span>
                <span className="sc-facet-desc">{facet.description}</span>
              </div>
              <div className={`sc-cell sc-cell-a ${aWins ? 'sc-cell-winner' : ''}`}>
                <div className="sc-bar-row">
                  <div className="sc-bar-track">
                    <div
                      className="sc-bar sc-bar-a"
                      style={{ width: `${facet.model1_score * 10}%` }}
                    />
                  </div>
                  <span className="sc-score">{facet.model1_score}</span>
                </div>
                <p className="sc-note">{facet.model1_note}</p>
              </div>
              <div className={`sc-cell sc-cell-b ${bWins ? 'sc-cell-winner' : ''}`}>
                <div className="sc-bar-row">
                  <div className="sc-bar-track">
                    <div
                      className="sc-bar sc-bar-b"
                      style={{ width: `${facet.model2_score * 10}%` }}
                    />
                  </div>
                  <span className="sc-score">{facet.model2_score}</span>
                </div>
                <p className="sc-note">{facet.model2_note}</p>
              </div>
            </div>
          );
        })}

        <div className="sc-total-row">
          <div className="sc-criterion sc-total-label">Total</div>
          <div className={`sc-cell sc-cell-a ${winnerSide === 'a' ? 'sc-cell-winner' : ''}`}>
            <span className="sc-total-score">{total_model1}</span>
            <span className="sc-total-max">/ {maxTotal}</span>
          </div>
          <div className={`sc-cell sc-cell-b ${winnerSide === 'b' ? 'sc-cell-winner' : ''}`}>
            <span className="sc-total-score">{total_model2}</span>
            <span className="sc-total-max">/ {maxTotal}</span>
          </div>
        </div>
      </div>

      <div className="judge-attribution">
        Judged by <span>{judge_model}</span>
      </div>
    </div>
  );
}
