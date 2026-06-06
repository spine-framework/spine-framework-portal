import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePortalItems, usePipelineIntegration, useItemManagement } from '../hooks/usePortalHooks'
import { UnifiedItemCard } from '../components/UnifiedItemCard'

// Simple UI components to avoid import issues
function Button({ children, variant = 'primary', onClick, disabled, loading }: { 
  children: React.ReactNode; 
  variant?: 'primary' | 'outline' | 'ghost'; 
  onClick?: () => void; 
  disabled?: boolean; 
  loading?: boolean; 
}) {
  const baseClasses = "px-4 py-2 rounded-md font-medium transition-colors"
  const variantClasses = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400",
    outline: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
    ghost: "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
  }
  
  return (
    <button 
      className={`${baseClasses} ${variantClasses[variant]}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? 'Loading...' : children}
    </button>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-lg shadow border border-gray-200 ${className}`}>
      {children}
    </div>
  )
}

Card.Header = function({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 py-4 border-b border-gray-200">
      {children}
    </div>
  )
}

Card.Content = function({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 py-4">
      {children}
    </div>
  )
}

function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: string }) {
  const variantClasses = {
    default: "bg-gray-100 text-gray-800",
    success: "bg-green-100 text-green-800",
    error: "bg-red-100 text-red-800",
    warning: "bg-yellow-100 text-yellow-800",
    info: "bg-blue-100 text-blue-800"
  }
  
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${variantClasses[variant as keyof typeof variantClasses] || variantClasses.default}`}>
      {children}
    </span>
  )
}

// Mock data for content items
const mockContentItems = [
  {
    id: 'kb1',
    type_slug: 'kb_article',
    context: 'kb',
    title: 'Getting Started with Spine Portal',
    status: 'published',
    created_at: new Date().toISOString(),
    helpful_count: 12,
    not_helpful_count: 1
  },
  {
    id: 'course1',
    type_slug: 'course_lesson',
    context: 'course',
    title: 'Introduction to Customer Support',
    status: 'published',
    created_at: new Date().toISOString(),
    helpful_count: 8,
    not_helpful_count: 0
  }
]

/**
 * Content Page - Unified view for Knowledge Base articles and Course lessons
 */
export function ContentPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'all' | 'kb' | 'course'>('all')
  
  // Use the unified portal hooks (automatically switches between mock/real)
  const { items, loading, error, refetch } = usePortalItems('content', {
    context: filter === 'all' ? undefined : filter
  })
  
  const { triggerPipeline, loading: pipelineLoading } = usePipelineIntegration()
  const { createItem } = useItemManagement()

  // Find selected item based on URL parameter
  const selectedItem = id ? items.find(item => item.id === id) : null

  const handleVote = (itemId: string, helpful: boolean) => {
    // TODO: Implement voting functionality
    console.log('Vote for item', itemId, helpful ? 'helpful' : 'not helpful')
  }

  const handleProgress = (itemId: string) => {
    // TODO: Implement progress tracking
    console.log('Progress updated for item:', itemId)
  }

  const handleGenerateKB = async (sourceItemId: string, sourceType: 'ticket' | 'question') => {
    try {
      const pipelineId = sourceType === 'ticket' 
        ? 'kb-generation-from-tickets' 
        : 'kb-generation-from-questions'
      
      const execution = await triggerPipeline(pipelineId, {
        source_item_id: sourceItemId,
        source_type: sourceType,
        triggered_by: 'user_action'
      })
      console.log('KB generation started via core pipeline:', execution)
    } catch (error) {
      console.error('KB generation failed:', error)
    }
  }

  const handleCreateArticle = async () => {
    try {
      const newItem = await createItem({
        type_slug: 'kb_article',
        context: 'kb',
        title: 'New KB Article',
        status: 'draft'
      })
      console.log('Created article:', newItem)
      refetch()
    } catch (error) {
      console.error('Failed to create article:', error)
    }
  }

  const handleCreateLesson = async () => {
    try {
      const newItem = await createItem({
        type_slug: 'course_lesson',
        context: 'course',
        title: 'New Course Lesson',
        status: 'draft'
      })
      console.log('Created lesson:', newItem)
      refetch()
    } catch (error) {
      console.error('Failed to create lesson:', error)
    }
  }

  // Handle loading state
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  // Handle error state
  if (error) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error loading content</h3>
          <p className="text-red-600">{error.message}</p>
        </div>
      </div>
    )
  }

  if (selectedItem) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate('/portal/content')}>
          ← Back to Content
        </Button>

        <UnifiedItemCard
          item={selectedItem}
          onVote={(helpful) => handleVote(selectedItem.id, helpful)}
          onProgress={() => handleProgress(selectedItem.id)}
          showThread={true}
        />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Base & Courses</h1>
          <p className="text-gray-600">Articles and learning materials</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCreateArticle}>
            + New Article
          </Button>
          <Button onClick={handleCreateLesson}>
            + New Lesson
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button 
          variant={filter === 'all' ? 'primary' : 'outline'}
          onClick={() => setFilter('all')}
        >
          All
        </Button>
        <Button 
          variant={filter === 'kb' ? 'primary' : 'outline'}
          onClick={() => setFilter('kb')}
        >
          Knowledge Base
        </Button>
        <Button 
          variant={filter === 'course' ? 'primary' : 'outline'}
          onClick={() => setFilter('course')}
        >
          Courses
        </Button>
      </div>

      <div className="space-y-4">
        {items.map(item => (
          <UnifiedItemCard
            key={item.id}
            item={item}
            onVote={(helpful) => handleVote(item.id, helpful)}
            onProgress={() => handleProgress(item.id)}
            onClick={() => navigate(`/portal/content/${item.id}`)}
          />
        ))}
        
        {items.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No content found. Create your first KB article or course lesson!
          </div>
        )}
      </div>
    </div>
  )
}
