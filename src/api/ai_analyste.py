"""AI Analyste API — chat with streaming."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.api.deps import get_current_user
from src.database import get_db
from src.models.ai_conversation import AIConversation, AIMessage
from src.models.user import User
from src.rate_limit import limiter
from src.services.ai_analyste import chat_stream, check_rate_limit, increment_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ai"])


class ChatRequest(BaseModel):
    message: str
    conversation_id: int | None = None


class ConversationOut(BaseModel):
    id: int
    title: str | None
    created_at: str
    updated_at: str
    message_count: int


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: str


@router.post("/ai/chat")
@limiter.limit("20/minute")
async def ai_chat(
    request: Request,
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream a chat response from the AI Analyste."""
    # Rate limit check
    allowed, used, limit = check_rate_limit(user.id, user.tier)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Limite quotidienne atteinte ({used}/{limit} messages). Revenez demain.",
        )

    # Get or create conversation
    conversation: AIConversation | None = None
    if body.conversation_id:
        conversation = db.query(AIConversation).filter(
            AIConversation.id == body.conversation_id,
            AIConversation.user_id == user.id,
        ).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation introuvable")

    if not conversation:
        # Create new conversation with first message as title
        title = body.message[:100] if len(body.message) > 100 else body.message
        conversation = AIConversation(user_id=user.id, title=title)
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    # Save user message
    user_msg = AIMessage(
        conversation_id=conversation.id,
        role="user",
        content=body.message,
    )
    db.add(user_msg)
    db.commit()

    # Load conversation history (last 20 messages for context)
    history = (
        db.query(AIMessage)
        .filter(AIMessage.conversation_id == conversation.id)
        .order_by(AIMessage.created_at.asc())
        .limit(20)
        .all()
    )
    messages = [{"role": m.role, "content": m.content} for m in history if m.role in ("user", "assistant")]

    # Increment rate limit
    increment_rate_limit(user.id)

    conv_id = conversation.id

    # Wrap stream to save assistant response at the end
    async def stream_and_save():
        full_response = []
        async for chunk in chat_stream(user.id, messages, user.tier):
            yield chunk
            # Parse chunk to accumulate response text
            if chunk.startswith("data: "):
                try:
                    data = json.loads(chunk[6:].strip())
                    if data.get("type") == "token":
                        full_response.append(data.get("text", ""))
                except (json.JSONDecodeError, KeyError):
                    pass

        # Save assistant message to DB
        if full_response:
            assistant_content = "".join(full_response)
            try:
                assistant_msg = AIMessage(
                    conversation_id=conv_id,
                    role="assistant",
                    content=assistant_content,
                )
                db.add(assistant_msg)
                db.commit()
            except Exception:
                logger.exception("Failed to save assistant message")

    headers = {
        "X-Conversation-Id": str(conv_id),
        "X-Rate-Limit-Used": str(used + 1),
        "X-Rate-Limit-Limit": str(limit),
    }

    return StreamingResponse(
        stream_and_save(),
        media_type="text/event-stream",
        headers=headers,
    )


@router.get("/ai/conversations")
def get_conversations(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List user's conversations."""
    conversations = (
        db.query(AIConversation)
        .filter(AIConversation.user_id == user.id)
        .order_by(AIConversation.updated_at.desc())
        .limit(50)
        .all()
    )
    result = []
    for c in conversations:
        msg_count = db.query(AIMessage).filter(AIMessage.conversation_id == c.id).count()
        result.append({
            "id": c.id,
            "title": c.title,
            "created_at": str(c.created_at),
            "updated_at": str(c.updated_at),
            "message_count": msg_count,
        })
    return result


@router.get("/ai/conversations/{conversation_id}/messages")
def get_conversation_messages(
    conversation_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all messages in a conversation."""
    conversation = db.query(AIConversation).filter(
        AIConversation.id == conversation_id,
        AIConversation.user_id == user.id,
    ).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation introuvable")

    messages = (
        db.query(AIMessage)
        .filter(AIMessage.conversation_id == conversation_id)
        .order_by(AIMessage.created_at.asc())
        .all()
    )
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "created_at": str(m.created_at),
        }
        for m in messages
    ]


@router.delete("/ai/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a conversation and all its messages."""
    conversation = db.query(AIConversation).filter(
        AIConversation.id == conversation_id,
        AIConversation.user_id == user.id,
    ).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation introuvable")

    db.query(AIMessage).filter(AIMessage.conversation_id == conversation_id).delete()
    db.delete(conversation)
    db.commit()
    return {"ok": True}


@router.get("/ai/rate-limit")
def get_rate_limit(
    user: User = Depends(get_current_user),
):
    """Get current rate limit status."""
    allowed, used, limit = check_rate_limit(user.id, user.tier)
    return {"used": used, "limit": limit, "remaining": limit - used}
