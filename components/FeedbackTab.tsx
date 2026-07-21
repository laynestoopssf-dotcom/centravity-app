import React, { useState, useEffect } from "react";
import { MessageSquare, Bug, Sparkles, ArrowUp, Plus, X, Lightbulb, Clock, CheckCircle2, Archive } from "lucide-react";
import { supabase } from "../utils/supabase";

export default function FeedbackTab({ profile, showToast }: any) {
  const [feedbackList, setFeedbackList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'votes' | 'newest'>('votes');
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newType, setNewType] = useState<'feature' | 'bug' | 'update'>('feature');
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (profile) fetchFeedback();
  }, [profile, sortBy]);

  const fetchFeedback = async () => {
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select(`
          *,
          profiles(first_name, last_name),
          feedback_votes(user_id)
        `);
      
      if (error) throw error;

      if (data) {
        const formatted = data.map((item: any) => ({
          ...item,
          voteCount: item.feedback_votes.length,
          hasVoted: item.feedback_votes.some((v: any) => v.user_id === profile.id)
        }));

        if (sortBy === 'votes') {
          formatted.sort((a, b) => b.voteCount - a.voteCount || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        } else {
          formatted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }

        setFeedbackList(formatted);
      }
    } catch (error: any) {
      console.error("Error fetching feedback:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (feedbackId: string, hasVoted: boolean) => {
    setFeedbackList(prev => prev.map(item => {
      if (item.id === feedbackId) {
        return { 
          ...item, 
          hasVoted: !hasVoted, 
          voteCount: hasVoted ? item.voteCount - 1 : item.voteCount + 1 
        };
      }
      return item;
    }).sort((a, b) => sortBy === 'votes' ? b.voteCount - a.voteCount : 0));

    try {
      if (hasVoted) {
        await supabase.from('feedback_votes').delete().match({ feedback_id: feedbackId, user_id: profile.id });
      } else {
        await supabase.from('feedback_votes').insert([{ feedback_id: feedbackId, user_id: profile.id }]);
      }
    } catch (error: any) {
      console.error("Vote Error:", error);
      showToast("Failed to register vote.", "error");
      fetchFeedback();
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('feedback').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
      
      setFeedbackList(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item));
      
      if (newStatus === 'completed') {
        showToast("Request completed and archived!", "success");
      } else {
        showToast(`Status updated to ${newStatus.replace('_', ' ').toUpperCase()}`, "success");
      }
    } catch (error: any) {
      console.error("Update Status Error:", error);
      showToast("Failed to update status.", "error");
    }
  };

  const submitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDescription.trim()) return;
    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.from('feedback').insert([{
        user_id: profile.id,
        type: newType,
        title: newTitle.trim(),
        description: newDescription.trim()
      }]).select().single();

      if (error) throw error;

      await supabase.from('feedback_votes').insert([{ feedback_id: data.id, user_id: profile.id }]);

      showToast("Feedback submitted successfully!", "success");
      setNewTitle("");
      setNewDescription("");
      setIsModalOpen(false);
      fetchFeedback();
    } catch (error: any) {
      console.error(error);
      showToast("Failed to submit feedback.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'planned': return <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-1 rounded-md uppercase flex items-center gap-1"><Clock size={12}/> Planned</span>;
      case 'in_progress': return <span className="bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-1 rounded-md uppercase flex items-center gap-1"><Clock size={12}/> Building</span>;
      case 'completed': return <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-md uppercase flex items-center gap-1"><CheckCircle2 size={12}/> Live</span>;
      default: return <span className="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-1 rounded-md uppercase">Reviewing</span>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'bug': return <div className="bg-red-100 p-2 rounded-lg text-red-600"><Bug size={16}/></div>;
      case 'update': return <div className="bg-orange-100 p-2 rounded-lg text-orange-600"><Lightbulb size={16}/></div>;
      default: return <div className="bg-purple-100 p-2 rounded-lg text-purple-600"><Sparkles size={16}/></div>;
    }
  };

  const displayedFeedback = feedbackList.filter(item => 
    viewMode === 'active' ? item.status !== 'completed' : item.status === 'completed'
  );

  if (loading) return <div className="animate-pulse flex space-x-4"><div className="flex-1 space-y-4 py-1"><div className="h-4 bg-gray-200 rounded w-3/4"></div><div className="space-y-2"><div className="h-4 bg-gray-200 rounded"></div><div className="h-4 bg-gray-200 rounded w-5/6"></div></div></div></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300 pb-12">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3"><MessageSquare size={32} className="text-blue-600" /> Community Board</h2>
          <p className="text-gray-500 mt-1">Help shape the future of TallyBound. Request features, report bugs, and vote on community ideas.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="bg-gray-900 text-white font-bold py-2.5 px-5 rounded-xl hover:bg-gray-800 transition-colors shadow-md flex items-center gap-2">
          <Plus size={18} /> New Request
        </button>
      </header>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 border-b border-gray-200 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-500">View:</span>
          <button onClick={() => setViewMode('active')} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${viewMode === 'active' ? 'bg-purple-50 text-purple-700' : 'text-gray-500 hover:bg-gray-100'}`}>Active</button>
          <button onClick={() => setViewMode('archived')} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${viewMode === 'archived' ? 'bg-gray-200 text-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}><Archive size={14} /> Archive</button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-500">Sort By:</span>
          <button onClick={() => setSortBy('votes')} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${sortBy === 'votes' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>Top Voted</button>
          <button onClick={() => setSortBy('newest')} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${sortBy === 'newest' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>Newest</button>
        </div>
      </div>

      <div className="space-y-4">
        {displayedFeedback.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 border-dashed">
            {viewMode === 'active' ? <Lightbulb size={48} className="mx-auto text-gray-300 mb-3" /> : <Archive size={48} className="mx-auto text-gray-300 mb-3" />}
            <h3 className="text-lg font-bold text-gray-900">{viewMode === 'active' ? 'No active requests yet' : 'Archive is empty'}</h3>
            <p className="text-gray-500">{viewMode === 'active' ? 'Be the first to suggest a new feature or improvement!' : 'Completed features and bug fixes will appear here.'}</p>
          </div>
        ) : (
          displayedFeedback.map((item) => (
            <div key={item.id} className={`bg-white rounded-2xl border ${item.status === 'completed' ? 'border-green-100 bg-green-50/30' : 'border-gray-100'} shadow-sm p-4 flex gap-4 transition-all hover:shadow-md`}>
              {/* Upvote Column */}
              <div className="flex flex-col items-center gap-1 min-w-[50px]">
                <button 
                  onClick={() => handleVote(item.id, item.hasVoted)}
                  disabled={item.status === 'completed'}
                  className={`p-2 rounded-xl transition-all ${item.hasVoted ? 'bg-blue-100 text-blue-600' : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'} ${item.status === 'completed' && 'opacity-50 cursor-not-allowed hover:bg-gray-50 hover:text-gray-400'}`}
                >
                  <ArrowUp size={20} strokeWidth={item.hasVoted ? 3 : 2} />
                </button>
                <span className={`font-black text-lg ${item.hasVoted ? 'text-blue-600' : 'text-gray-600'}`}>{item.voteCount}</span>
              </div>

              {/* Content Column */}
              <div className="flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(item.type)}
                    <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                  </div>
                  
                  {/* ADMIN STATUS CONTROLS */}
                  {profile?.role === 'owner' ? (
                    <select 
                      value={item.status} 
                      onChange={(e) => updateStatus(item.id, e.target.value)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase outline-none cursor-pointer border ${item.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' : item.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : item.status === 'planned' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}
                    >
                      <option value="open">Reviewing</option>
                      <option value="planned">Planned</option>
                      <option value="in_progress">Building</option>
                      <option value="completed">Completed (Archive)</option>
                    </select>
                  ) : (
                    getStatusBadge(item.status)
                  )}

                </div>
                <p className="text-gray-600 text-sm mb-3 leading-relaxed">{item.description}</p>
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-400">
                  <span>{item.profiles?.first_name} {item.profiles?.last_name}</span>
                  <span>•</span>
                  <span>{new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Request Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Lightbulb className="text-blue-600"/> Submit Request
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 bg-gray-100 p-1.5 rounded-full"><X size={20}/></button>
            </div>

            <form onSubmit={submitFeedback} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Type of Feedback</label>
                <div className="grid grid-cols-3 gap-3">
                  <button type="button" onClick={() => setNewType('feature')} className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition-all ${newType === 'feature' ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'}`}>
                    <Sparkles size={20} /><span className="text-xs font-bold">Feature</span>
                  </button>
                  <button type="button" onClick={() => setNewType('update')} className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition-all ${newType === 'update' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'}`}>
                    <Lightbulb size={20} /><span className="text-xs font-bold">Improvement</span>
                  </button>
                  <button type="button" onClick={() => setNewType('bug')} className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition-all ${newType === 'bug' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'}`}>
                    <Bug size={20} /><span className="text-xs font-bold">Bug Report</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Title</label>
                <input type="text" required maxLength={100} placeholder="Brief summary of your request..." value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-semibold" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Description</label>
                <textarea required rows={4} placeholder="What is the problem? How should it work instead?" value={newDescription} onChange={e => setNewDescription(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 resize-none font-medium"></textarea>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <button type="submit" disabled={isSubmitting} className="w-full bg-gray-900 text-white font-bold py-3 px-4 rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50">
                  {isSubmitting ? "Submitting..." : "Post to Board"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}