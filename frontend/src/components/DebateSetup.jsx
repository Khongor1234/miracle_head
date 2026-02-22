import { useState } from 'react';
import { api } from '../api';
import './DebateSetup.css';

export default function DebateSetup({ onDebateCreated }) {
  const [model1, setModel1] = useState('');
  const [model2, setModel2] = useState('');
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [pov1, setPov1] = useState('');
  const [pov2, setPov2] = useState('');
  const [maxTurns, setMaxTurns] = useState(10);
  const [generatingPOVs, setGeneratingPOVs] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState([]);

  const handleGeneratePOVs = async () => {
    if (!topic.trim()) {
      setErrors(['Please enter a topic before generating POVs.']);
      return;
    }
    setErrors([]);
    setGeneratingPOVs(true);
    try {
      const result = await api.generatePOVs(topic, keywords);
      if (result.pov_for) setPov1(result.pov_for);
      if (result.pov_against) setPov2(result.pov_against);
    } catch (e) {
      setErrors(['Failed to generate POVs. Please try again.']);
    } finally {
      setGeneratingPOVs(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors([]);

    const validationErrors = [];
    if (!model1.trim()) validationErrors.push('Model 1 is required.');
    if (!model2.trim()) validationErrors.push('Model 2 is required.');
    if (!topic.trim()) validationErrors.push('Topic is required.');
    if (!pov1.trim()) validationErrors.push('Position 1 is required.');
    if (!pov2.trim()) validationErrors.push('Position 2 is required.');
    if (maxTurns < 2 || maxTurns > 30) validationErrors.push('Max turns must be between 2 and 30.');

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setCreating(true);
    try {
      const debate = await api.createDebate({
        model1: model1.trim(),
        model2: model2.trim(),
        topic: topic.trim(),
        pov1: pov1.trim(),
        pov2: pov2.trim(),
        max_turns: maxTurns,
      });
      onDebateCreated(debate);
    } catch (e) {
      if (e.errors) {
        setErrors(e.errors);
      } else {
        setErrors([e.message || 'Failed to create debate.']);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="debate-setup">
      <div className="setup-container">
        <h2 className="setup-title">New Debate</h2>
        <p className="setup-subtitle">Configure two models to argue opposing positions on a topic.</p>

        <form onSubmit={handleSubmit} className="setup-form">

          {/* Topic section */}
          <div className="form-section">
            <div className="form-section-label">Topic</div>
            <div className="form-group">
              <textarea
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Enter the debate topic..."
                className="form-textarea"
                rows={2}
              />
            </div>
            <div className="form-group">
              <label htmlFor="keywords">
                Keywords <span className="optional">(optional, used for POV generation)</span>
              </label>
              <input
                id="keywords"
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. consciousness, autonomy, legal personhood"
                className="form-input"
              />
            </div>
          </div>

          {/* Models + Positions */}
          <div className="form-section">
            <div className="pov-header-row">
              <div className="form-section-label" style={{ marginBottom: 0 }}>Participants &amp; Positions</div>
              <button
                type="button"
                className="generate-btn"
                onClick={handleGeneratePOVs}
                disabled={generatingPOVs || !topic.trim()}
              >
                {generatingPOVs ? 'Generating...' : 'Generate POVs'}
              </button>
            </div>
            <div className="sides-row">
              <div className="side-card side-card-a">
                <div className="side-card-badge">
                  <div className="side-card-color" />
                  <span className="side-card-label">Side A</span>
                </div>
                <div className="form-group">
                  <label htmlFor="model1">Model (OpenRouter ID)</label>
                  <input
                    id="model1"
                    type="text"
                    value={model1}
                    onChange={(e) => setModel1(e.target.value)}
                    placeholder="e.g. openai/gpt-4o"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="pov1">Position</label>
                  <textarea
                    id="pov1"
                    value={pov1}
                    onChange={(e) => setPov1(e.target.value)}
                    placeholder="Model A's stance..."
                    className="form-textarea"
                    rows={3}
                  />
                </div>
              </div>

              <div className="side-card side-card-b">
                <div className="side-card-badge">
                  <div className="side-card-color" />
                  <span className="side-card-label">Side B</span>
                </div>
                <div className="form-group">
                  <label htmlFor="model2">Model (OpenRouter ID)</label>
                  <input
                    id="model2"
                    type="text"
                    value={model2}
                    onChange={(e) => setModel2(e.target.value)}
                    placeholder="e.g. anthropic/claude-sonnet-4-5"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="pov2">Position</label>
                  <textarea
                    id="pov2"
                    value={pov2}
                    onChange={(e) => setPov2(e.target.value)}
                    placeholder="Model B's stance..."
                    className="form-textarea"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="form-section">
            <div className="form-section-label">Settings</div>
            <div className="turns-row">
              <label>Max turns</label>
              <input
                type="range"
                value={maxTurns}
                onChange={(e) => setMaxTurns(Number(e.target.value))}
                min={2}
                max={30}
                step={1}
              />
              <span className="turns-value">{maxTurns}</span>
            </div>
          </div>

          {errors.length > 0 && (
            <div className="error-list">
              {errors.map((err, i) => (
                <div key={i} className="error-item">{err}</div>
              ))}
            </div>
          )}

          <div className="form-footer">
            <button type="submit" className="start-btn" disabled={creating}>
              {creating ? 'Creating...' : 'Start Debate'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
