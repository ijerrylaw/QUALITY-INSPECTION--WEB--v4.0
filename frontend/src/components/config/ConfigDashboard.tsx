import { useState } from 'react';
import { Plus, X, Save, Shield } from 'lucide-react';
import { Button } from '../ui/Button';

// Mock Config Data
const INITIAL_DEFECTS = [
  { id: 'd1', name: 'Weak Spot', class: 'Minor Visual' },
  { id: 'd2', name: 'Stains', class: 'Minor Visual' },
  { id: 'd3', name: 'Torn Cuff', class: 'Major Visual' },
  { id: 'd4', name: 'Hole at Crotch', class: 'Critical' },
  { id: 'd5', name: 'Pinhole', class: 'Zero Tolerance' }
];

const SKU_MATERIALS = ['Nitrile', 'Latex', 'Vinyl', 'Neoprene'];
const AQL_PROFILES = [
  { id: 'p1', name: 'Standard Factory Default', isDefault: true, limits: { 'Minor Visual': 2.5, 'Major Visual': 1.5, 'Critical': 0.65 } },
  { id: 'p2', name: 'Strict Client (Ansell)', isDefault: false, limits: { 'Minor Visual': 1.5, 'Major Visual': 1.0, 'Critical': 0.4 } }
];

export function ConfigDashboard() {
  const [activeTab, setActiveTab] = useState<'defects' | 'sku' | 'profiles'>('defects');
  
  // States
  const [defects] = useState(INITIAL_DEFECTS);
  const [skuMaterials, setSkuMaterials] = useState(SKU_MATERIALS);
  const [newMaterial, setNewMaterial] = useState('');

  const removeMaterial = (mat: string) => {
    setSkuMaterials(skuMaterials.filter(m => m !== mat));
  };

  const addMaterial = () => {
    if (newMaterial && !skuMaterials.includes(newMaterial)) {
      setSkuMaterials([...skuMaterials, newMaterial]);
      setNewMaterial('');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Tabs */}
      <div className="flex space-x-1 bg-surface border border-gray-800 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('defects')}
          className={`flex-1 py-3 px-4 rounded-md text-sm font-semibold transition-all ${
            activeTab === 'defects' 
              ? 'bg-brand-primary text-white shadow-md' 
              : 'text-muted hover:text-primary hover:bg-white/5'
          }`}
        >
          Defect Definitions
        </button>
        <button
          onClick={() => setActiveTab('profiles')}
          className={`flex-1 py-3 px-4 rounded-md text-sm font-semibold transition-all ${
            activeTab === 'profiles' 
              ? 'bg-brand-primary text-white shadow-md' 
              : 'text-muted hover:text-primary hover:bg-white/5'
          }`}
        >
          AQL Profiles
        </button>
        <button
          onClick={() => setActiveTab('sku')}
          className={`flex-1 py-3 px-4 rounded-md text-sm font-semibold transition-all ${
            activeTab === 'sku' 
              ? 'bg-brand-primary text-white shadow-md' 
              : 'text-muted hover:text-primary hover:bg-white/5'
          }`}
        >
          SKU Builder Segments
        </button>
      </div>

      {/* Tab Content: Defects */}
      {activeTab === 'defects' && (
        <div className="bg-surface border border-gray-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-gray-800 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-primary uppercase">Defect Classification Matrix</h3>
              <p className="text-sm text-muted">Re-map defects to different severity classes.</p>
            </div>
            <Button variant="secondary" className="flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Defect
            </Button>
          </div>
          
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800">Defect Name</th>
                <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800">Severity Class</th>
                <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {defects.map(defect => (
                <tr key={defect.id} className="hover:bg-white/5 transition-colors">
                  <td className="py-3 px-4 text-sm font-mono text-primary border-b border-gray-800/50">{defect.name}</td>
                  <td className="py-3 px-4 border-b border-gray-800/50">
                    <select 
                      className="bg-canvas border border-gray-700 text-sm text-primary rounded-lg px-3 py-1.5 focus:border-brand-primary outline-none"
                      defaultValue={defect.class}
                    >
                      <option>Minor Visual</option>
                      <option>Major Visual</option>
                      <option>Critical</option>
                      <option>Zero Tolerance</option>
                    </select>
                  </td>
                  <td className="py-3 px-4 border-b border-gray-800/50 text-right">
                    <button className="text-rose-400 hover:text-rose-300 text-sm font-semibold">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 bg-canvas flex justify-end">
            <Button className="flex items-center gap-2">
              <Save className="w-4 h-4" /> Save Changes
            </Button>
          </div>
        </div>
      )}

      {/* Tab Content: Profiles */}
      {activeTab === 'profiles' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button variant="secondary" className="flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create New Profile
            </Button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {AQL_PROFILES.map(profile => (
              <div key={profile.id} className="bg-surface border border-gray-800 rounded-xl p-6 shadow-sm relative">
                {profile.isDefault && (
                  <span className="absolute top-4 right-4 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold uppercase tracking-wider bg-brand-primary/10 text-brand-secondary border border-brand-secondary/30">
                    <Shield className="w-3 h-3" /> System Default
                  </span>
                )}
                <h3 className="text-xl font-bold text-primary uppercase mb-4">{profile.name}</h3>
                
                <div className="space-y-4">
                  {Object.entries(profile.limits).map(([severity, limit]) => (
                    <div key={severity} className="flex justify-between items-center p-3 bg-canvas border border-gray-800 rounded-lg">
                      <span className="text-sm font-semibold text-muted uppercase tracking-wider">{severity} AQL</span>
                      <input 
                        type="number" 
                        defaultValue={limit} 
                        step="0.1"
                        className="w-20 bg-surface border border-gray-700 text-primary font-mono text-center rounded-md py-1 focus:border-brand-primary outline-none"
                      />
                    </div>
                  ))}
                </div>
                
                <div className="mt-6 pt-6 border-t border-gray-800 flex justify-end gap-3">
                  <Button variant="secondary" className="px-4">Edit Metadata</Button>
                  <Button className="px-6 flex items-center gap-2"><Save className="w-4 h-4" /> Save</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Content: SKU Builder */}
      {activeTab === 'sku' && (
        <div className="bg-surface border border-gray-800 rounded-xl p-6 shadow-sm">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-primary uppercase">SKU Dictionary: Materials</h3>
            <p className="text-sm text-muted">Manage the permissible material codes for product SKUs.</p>
          </div>
          
          <div className="flex flex-wrap gap-3 mb-8">
            {skuMaterials.map(mat => (
              <div key={mat} className="bg-brand-primary/10 text-brand-secondary border border-brand-secondary/30 text-sm font-semibold rounded-lg px-3 py-2 flex items-center gap-2">
                {mat}
                <button 
                  onClick={() => removeMaterial(mat)}
                  className="hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          
          <div className="flex items-center gap-4 border-t border-gray-800 pt-6">
            <input 
              type="text" 
              value={newMaterial}
              onChange={(e) => setNewMaterial(e.target.value)}
              placeholder="E.g., Polyisoprene"
              className="flex-1 bg-canvas border border-gray-700 rounded-lg h-12 px-4 text-sm text-primary focus:border-brand-primary outline-none"
            />
            <Button onClick={addMaterial} className="h-12 px-6 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Material
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
