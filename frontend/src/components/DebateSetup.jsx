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
        <form onSubmit={handleSubmit} className="setup-form">

          <div className="form-row two-col">
            <div className="form-group">
              <label htmlFor="model1">Model 1 (OpenRouter ID)</label>
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
              <label htmlFor="model2">Model 2 (OpenRouter ID)</label>
              <input
                id="model2"
                type="text"
                value={model2}
                onChange={(e) => setModel2(e.target.value)}
                placeholder="e.g. anthropic/claude-sonnet-4-5"
                className="form-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="topic">Topic</label>
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

          <div className="pov-header">
            <span className="pov-label">Positions</span>
            <button
              type="button"
              className="generate-btn"
              onClick={handleGeneratePOVs}
              disabled={generatingPOVs || !topic.trim()}
            >
              {generatingPOVs ? 'Generating...' : 'Generate POVs'}
            </button>
          </div>

          <div className="form-row two-col">
            <div className="form-group">
              <label htmlFor="pov1">Position 1 (Model 1 argues)</label>
              <textarea
                id="pov1"
                value={pov1}
                onChange={(e) => setPov1(e.target.value)}
                placeholder="Model 1's stance..."
                className="form-textarea"
                rows={3}
              />
            </div>
            <div className="form-group">
              <label htmlFor="pov2">Position 2 (Model 2 argues)</label>
              <textarea
                id="pov2"
                value={pov2}
                onChange={(e) => setPov2(e.target.value)}
                placeholder="Model 2's stance..."
                className="form-textarea"
                rows={3}
              />
            </div>
          </div>

          <div className="form-group form-group-inline">
            <label htmlFor="maxTurns">Max turns</label>
            <input
              id="maxTurns"
              type="number"
              value={maxTurns}
              onChange={(e) => setMaxTurns(Number(e.target.value))}
              min={2}
              max={30}
              className="form-input form-input-narrow"
            />
          </div>

          {errors.length > 0 && (
            <div className="error-list">
              {errors.map((err, i) => (
                <div key={i} className="error-item">{err}</div>
              ))}
            </div>
          )}

          <button
            type="submit"
            className="start-btn"
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Start Debate'}
          </button>
        </form>
      </div>
    </div>
  );
}
